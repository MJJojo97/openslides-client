import { EventEmitter, Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { BaseModel, ModelConstructor } from '../../shared/models/base/base-model';
import { Deferred } from '../promises/deferred';
import { CollectionMapperService } from './collection-mapper.service';

/**
 * Represents information about a deleted model.
 *
 * As the model doesn't exist anymore, just the former id and collection is known.
 */
export interface DeletedInformation {
    collection: string;
    id: number;
}

export interface CollectionIds {
    [collection: string]: number[];
}

/**
 * Helper class for collecting data during the update phase of the DataStore.
 */
export class UpdateSlot {
    /**
     * Count instnaces of this class to easily compare them.
     */
    private static ID_COUNTER = 1;

    /**
     * Mapping of changed model ids to their collection.
     */
    private changedModels: CollectionIds = {};

    /**
     * Mapping of deleted models to their collection.
     */
    private deletedModels: CollectionIds = {};

    /**
     * The object's id.
     */
    private _id: number;

    /**
     * @param DS Carries the DataStore: TODO (see below `DataStoreUpdateManagerService.getNewUpdateSlot`)
     */
    public constructor(public readonly DS: DataStoreService) {
        this._id = UpdateSlot.ID_COUNTER++;
    }

    /**
     * Adds changed model information
     *
     * @param collection The collection
     * @param id The id
     */
    public addChangedModel(collection: string, id: number): void {
        if (!this.changedModels[collection]) {
            this.changedModels[collection] = [];
        }
        this.changedModels[collection].push(id);
    }

    /**
     * Adds deleted model information
     *
     * @param collection The collection
     * @param id The id
     */
    public addDeletedModel(collection: string, id: number): void {
        if (!this.deletedModels[collection]) {
            this.deletedModels[collection] = [];
        }
        this.deletedModels[collection].push(id);
    }

    /**
     * @param collection The collection
     * @returns the list of changed model ids for the collection
     */
    public getChangedModelIdsForCollection(collection: string): number[] {
        return this.changedModels[collection] || [];
    }

    /**
     * @returns the mapping of all changed models
     */
    public getChangedModels(): CollectionIds {
        return this.changedModels;
    }

    /**
     * @param collection The collection
     * @returns the list of deleted model ids for the collection
     */
    public getDeletedModelIdsForCollection(collection: string): number[] {
        return this.deletedModels[collection] || [];
    }

    /**
     * @returns the mapping of all deleted models
     */
    public getDeletedModels(): CollectionIds {
        return this.deletedModels;
    }

    /**
     * @returns all changed and deleted model ids in one array. If an id was
     * changed and deleted, it will be there twice! But this should not be the case.
     */
    public getAllModelsIdsForCollection(collection: string): number[] {
        return this.getDeletedModelIdsForCollection(collection).concat(
            this.getChangedModelIdsForCollection(collection)
        );
    }

    /**
     * Compares this object to another update slot.
     */
    public equal(other: UpdateSlot): boolean {
        return this._id === other._id;
    }
}

/**
 * represents a collection on the Django server, uses an ID to access a {@link BaseModel}.
 *
 * Part of {@link DataStoreService}
 */
interface ModelCollection {
    [id: number]: BaseModel;
}

/**
 * The actual storage that stores collections, accessible by strings.
 *
 * {@link DataStoreService}
 */
interface ModelStorage {
    [collection: string]: ModelCollection;
}

/**
 * TODO: Avoid circular dependencies between `DataStoreUpdateManagerService` and
 * `DataStoreService` and split them into two files
 */
@Injectable({
    providedIn: `root`
})
export class DataStoreUpdateManagerService {
    /**
     * The current update slot
     */
    private currentUpdateSlot: UpdateSlot | null = null;

    /**
     * Requests for getting an update slot.
     */
    private updateSlotRequests: Deferred[] = [];

    /**
     * @param mapperService
     */
    public constructor(private mapperService: CollectionMapperService) {}

    /**
     * Retrieve the current update slot.
     */
    public getCurrentUpdateSlot(): UpdateSlot | null {
        return this.currentUpdateSlot;
    }

    /**
     * Get a new update slot. Returns a promise that must be awaited, if there is another
     * update in progress.
     *
     * @param DS The DataStore. This is a hack, becuase we cannot use the DataStore
     * here, because these are cyclic dependencies... --> TODO
     */
    public async getNewUpdateSlot(DS: DataStoreService): Promise<UpdateSlot> {
        if (this.currentUpdateSlot) {
            const request = new Deferred();
            this.updateSlotRequests.push(request);
            await request;
        }
        this.currentUpdateSlot = new UpdateSlot(DS);
        return this.currentUpdateSlot;
    }

    /**
     * Commits the given update slot. This slot must be the current one. If there are requests
     * for update slots queued, the next one will be served.
     *
     * Note: I added this param to make sure, that only the user of the slot
     * can commit the update and no one else.
     *
     * @param slot The slot to commit
     */
    public commit(slot: UpdateSlot): void {
        if (!this.currentUpdateSlot || !this.currentUpdateSlot.equal(slot)) {
            throw new Error(`No or wrong update slot to be finished!`);
        }
        this.currentUpdateSlot = null;

        // notify repositories in two phases
        const repositories = this.mapperService.getAllRepositories();

        // Phase 1: deleting and creating of view models (in this order)
        repositories.forEach(repo => {
            const deletedModelIds = slot.getDeletedModelIdsForCollection(repo.collection);
            repo.deleteModels(deletedModelIds);

            const changedModelIds = slot.getChangedModelIdsForCollection(repo.collection);
            repo.changedModels(changedModelIds);
        });

        // Phase 2: updating all repositories
        repositories.forEach(repo => {
            repo.commitUpdate(slot.getAllModelsIdsForCollection(repo.collection));
        });

        slot.DS.triggerModifiedObservable();

        this.serveNextSlot();
    }

    public dropUpdateSlot(): void {
        this.currentUpdateSlot = null;
        this.serveNextSlot();
    }

    private serveNextSlot(): void {
        if (this.updateSlotRequests.length > 0) {
            console.log(`Concurrent update slots`);
            const request = this.updateSlotRequests.pop();
            request.resolve();
        }
    }
}

/**
 * All mighty DataStore that comes with all OpenSlides components.
 * Use this.DS in an OpenSlides Component to Access the store.
 * Used by a lot of components, classes and services.
 * Changes can be observed
 */
@Injectable({
    providedIn: `root`
})
export class DataStoreService {
    private modelStore: ModelStorage = {};

    /**
     * Subjects for changed elements (notified, even if there is a current update slot) for
     * a specific collection.
     */
    private changedSubjects: { [collection: string]: Subject<BaseModel> } = {};

    /**
     * Observable subject for changed or deleted models in the datastore.
     */
    private readonly modifiedSubject: Subject<void> = new Subject<void>();

    /**
     * Observe the datastore for changes and deletions.
     *
     * @return an observable for changed and deleted objects.
     */
    public get modifiedObservable(): Observable<void> {
        return this.modifiedSubject.asObservable();
    }

    /**
     * Observable subject for changed or deleted models in the datastore.
     */
    private readonly clearEvent: EventEmitter<string[]> = new EventEmitter<string[]>();

    /**
     * Observe the datastore for changes and deletions.
     *
     * @return an observable for changed and deleted objects.
     */
    public get clearObservable(): Observable<string[]> {
        return this.clearEvent.asObservable();
    }

    /**
     * @param storageService use StorageService to preserve the DataStore.
     * @param modelMapper
     * @param DSUpdateManager
     */
    public constructor(
        private modelMapper: CollectionMapperService,
        private DSUpdateManager: DataStoreUpdateManagerService
    ) {}

    /**
     * Get an model observable for models from a given collection. These observable will be notified,
     * even if there is an active update slot. So use this with caution (-> only collections with less models).
     *
     * @param collectionType The collection
     */
    public getChangeObservable<T extends BaseModel>(collectionType: ModelConstructor<T> | string): Observable<T> {
        const collection = this.getCollection(collectionType);
        if (!this.changedSubjects[collection]) {
            this.changedSubjects[collection] = new Subject();
        }
        return this.changedSubjects[collection].asObservable() as Observable<T>;
    }

    /**
     * Clears the complete DataStore and Cache.
     */
    public async clear(): Promise<void> {
        this.modelStore = {};
        this.clearEvent.next();
    }

    /**
     * Deletes all models that belong to a meeting.
     */
    public async clearMeetingModels(): Promise<void> {
        const removedCollections = [];
        for (const collection of Object.keys(this.modelStore)) {
            if (this.modelMapper.isMeetingSpecificCollection(collection)) {
                delete this.modelStore[collection];
                removedCollections.push(collection);
                this.triggerModifiedObservable();
            }
        }
        this.clearEvent.emit(removedCollections);
    }

    /**
     * Returns the collection _string_ based on the model given. If a string is given, it's just returned.
     * @param collectionType Either a Model constructor or a string.
     * @returns the collection string
     */
    private getCollection<T extends BaseModel<T>>(collectionType: ModelConstructor<T> | string): string {
        if (typeof collectionType === `string`) {
            return collectionType;
        } else {
            return this.modelMapper.getCollection(collectionType);
        }
    }

    /**
     * Read one model based on the collection and id from the DataStore.
     *
     * @param collectionType The desired BaseModel or collection to be read from the dataStore
     * @param ids One ID of the BaseModel
     * @return The given BaseModel-subclass instance
     * @example: this.DS.get(User, 1)
     * @example: this.DS.get<Countdown>('core/countdown', 2)
     */
    public get<T extends BaseModel<T>>(collectionType: ModelConstructor<T> | string, id: number): T {
        const collection = this.getCollection<T>(collectionType);

        const modelCollection: ModelCollection = this.modelStore[collection];
        if (!modelCollection) {
            return;
        } else {
            return modelCollection[id] as T;
        }
    }

    /**
     * Read multiple ID's from dataStore.
     *
     * @param collectionType The desired BaseModel or collection to be read from the dataStore
     * @param ids Multiple IDs as a list of IDs of BaseModel
     * @return The BaseModel-list corresponding to the given ID(s)
     * @example: this.DS.getMany(User, [1,2,3,4,5])
     * @example: this.DS.getMany<User>('users/user', [1,2,3,4,5])
     */
    public getMany<T extends BaseModel<T>>(collectionType: ModelConstructor<T> | string, ids: number[]): T[] {
        const collection = this.getCollection<T>(collectionType);

        const modelCollection: ModelCollection = this.modelStore[collection];
        if (!modelCollection) {
            return [];
        }
        const models = ids.map(id => modelCollection[id]).filter(model => !!model); // remove non valid models.
        return models as T[];
    }

    /**
     * Get all models of the given collection from the DataStore.
     *
     * @param collectionType The desired BaseModel or collection to be read from the dataStore
     * @return The BaseModel-list of all instances of T
     * @example: this.DS.getAll(User)
     * @example: this.DS.getAll<User>('users/user')
     */
    public getAll<T extends BaseModel<T>>(collectionType: ModelConstructor<T> | string): T[] {
        const collection = this.getCollection<T>(collectionType);

        const modelCollection: ModelCollection = this.modelStore[collection];
        if (!modelCollection) {
            return [];
        } else {
            return Object.values(modelCollection);
        }
    }

    /**
     * Filters the dataStore by type.
     *
     * @param collectionType The desired BaseModel type to be read from the dataStore
     * @param callback a filter function
     * @return The BaseModel-list corresponding to the filter function
     * @example this.DS.filter<User>(User, myUser => myUser.first_name === "Max")
     */
    public filter<T extends BaseModel<T>>(
        collectionType: ModelConstructor<T> | string,
        callback: (model: T) => boolean
    ): T[] {
        return this.getAll<T>(collectionType).filter(callback);
    }

    /**
     * Finds a model item in the dataStore by type.
     *
     * @param collectionType The desired BaseModel type to be read from the dataStore
     * @param callback a find function
     * @return The first BaseModel item matching the filter function
     * @example this.DS.find<User>(User, myUser => myUser.first_name === "Jenny")
     */
    public find<T extends BaseModel<T>>(
        collectionType: ModelConstructor<T> | string,
        callback: (model: T) => boolean
    ): T {
        return this.getAll<T>(collectionType).find(callback);
    }

    /**
     * Add one or multiple models to dataStore.
     *
     * @param models BaseModels to add to the store
     * @example this.DS.add([new User(1)])
     * @example this.DS.add([new User(2), new User(3)])
     * @example this.DS.add(arrayWithUsers)
     */
    public async add(models: BaseModel[]): Promise<void> {
        models.forEach(model => {
            const collection = model.collection;
            if (this.modelStore[collection] === undefined) {
                this.modelStore[collection] = {};
            }
            this.modelStore[collection][model.id] = model;
            this.publishChangedInformation(model);
        });
    }

    /**
     */
    public async addOrUpdate(models: BaseModel[]): Promise<void> {
        models.forEach(model => {
            const collection = model.collection;
            if (this.modelStore[collection] === undefined) {
                this.modelStore[collection] = {};
            }

            if (this.modelStore[collection][model.id]) {
                const storedModel = this.modelStore[collection][model.id];
                const updatedData = storedModel.getUpdatedData(model);
                const targetClass = this.modelMapper.getModelConstructor(collection);
                this.modelStore[collection][model.id] = new targetClass(updatedData);
            } else {
                this.modelStore[collection][model.id] = model;
            }

            this.publishChangedInformation(this.modelStore[collection][model.id]);
        });
    }

    /**
     * removes one or multiple models from dataStore.
     *
     * @param collection The desired BaseModel type to be removed from the datastore
     * @param ids A list of IDs of BaseModels to remove from the datastore
     * @param changeId The changeId of this update. If given, the storage will be flushed to the
     * cache. Else one can call {@method flushToStorage} to do this manually.
     * @example this.DS.remove('users/user', [myUser.id, 3, 4])
     */
    public async remove(collection: string, ids: number[] /*, changeId?: number*/): Promise<void> {
        ids.forEach(id => {
            if (this.modelStore[collection]) {
                delete this.modelStore[collection][id];
            }
            this.publishDeletedInformation({
                collection,
                id
            });
        });
    }

    /**
     * Resets the DataStore and set the given models as the new content.
     * @param models A list of models to set the DataStore to.
     * @param newMaxChangeId Optional. If given, the max change id will be updated
     * and the store flushed to the storage
     */
    public async set(models?: BaseModel[] /*, newMaxChangeId?: number*/): Promise<void> {
        const modelStoreReference = this.modelStore;
        this.modelStore = {};
        // Inform about the deletion
        Object.keys(modelStoreReference).forEach(collection => {
            Object.keys(modelStoreReference[collection]).forEach(id => {
                this.publishDeletedInformation({
                    collection,
                    id: +id // needs casting, because Objects.keys gives all keys as strings...
                });
            });
        });
        if (models && models.length) {
            await this.add(models /*, newMaxChangeId*/);
        }
    }

    /**
     * Informs the changed and changedOrDeleted subject about a change.
     *
     * @param model The model to publish
     */
    private publishChangedInformation(model: BaseModel): void {
        const slot = this.DSUpdateManager.getCurrentUpdateSlot();
        if (slot) {
            slot.addChangedModel(model.collection, model.id);
            // triggerModifiedObservable will be called by committing the update slot.
        } else {
            this.triggerModifiedObservable();
        }

        if (this.changedSubjects[model.collection]) {
            this.changedSubjects[model.collection].next(model);
        }
    }

    /**
     * Informs the deleted and changedOrDeleted subject about a deletion.
     *
     * @param information The information about the deleted model
     */
    private publishDeletedInformation(information: DeletedInformation): void {
        const slot = this.DSUpdateManager.getCurrentUpdateSlot();
        if (slot) {
            slot.addDeletedModel(information.collection, information.id);
            // triggerModifiedObservable will be called by committing the update slot.
        } else {
            this.triggerModifiedObservable();
        }
    }

    /**
     * Triggers the modified subject.
     */
    public triggerModifiedObservable(): void {
        this.modifiedSubject.next();
    }

    public print(): void {
        console.log(this.modelStore);
    }
}
