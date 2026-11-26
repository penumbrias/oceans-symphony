// The one door the edit writers use to keep the version before an edit in
// Recent changes (see keepEditRestorePoint in localDb.js). Its own module so
// the write-path tests can watch it: the preview database the tests run on
// keeps no history.
export { keepEditRestorePoint } from "@/lib/localDb";
