export { AuthProvider, useAuth, type AuthState } from "./auth-context";
// useAccountResource is imported from "./use-account-resource" directly:
// re-exported here, it would ride with AuthProvider into every route's first
// load (about 1.7 KB of the resource hook on pages that never use it).
