// Ids for your own nature sounds (ownSounds.js), in a module with no
// imports so the backup code can use them without pulling in the rest.
export const OWN_PREFIX = "own-"; // a sound's id: own-<ImageAsset id>
export const OWN_FILE_PREFIX = "nature-"; // a stored file added through Nature sounds
export const isOwnSoundId = (id) => typeof id === "string" && id.startsWith(OWN_PREFIX);
export const isOwnSoundFileId = (fileId) => typeof fileId === "string" && fileId.startsWith(OWN_FILE_PREFIX);
