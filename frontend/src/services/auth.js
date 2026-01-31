/** Cognito authentication service. */
import { AuthenticationDetails, CognitoUser, CognitoUserPool, CognitoUserAttribute, } from "amazon-cognito-identity-js";
// These are injected at build time via env vars.
const USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID ?? "";
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID ?? "";
const userPool = USER_POOL_ID && CLIENT_ID
    ? new CognitoUserPool({
        UserPoolId: USER_POOL_ID,
        ClientId: CLIENT_ID,
    })
    : null;
function sessionToUser(session) {
    const idToken = session.getIdToken();
    return {
        username: idToken.payload["cognito:username"] ?? idToken.payload.sub,
        email: idToken.payload.email ?? "",
        idToken: idToken.getJwtToken(),
    };
}
/** Sign in with username/email + password. */
export function signIn(username, password) {
    return new Promise((resolve, reject) => {
        if (!userPool)
            return reject(new Error("Auth not configured"));
        const cognitoUser = new CognitoUser({
            Username: username,
            Pool: userPool,
        });
        const authDetails = new AuthenticationDetails({
            Username: username,
            Password: password,
        });
        cognitoUser.authenticateUser(authDetails, {
            onSuccess: (session) => resolve(sessionToUser(session)),
            onFailure: (err) => reject(err),
            newPasswordRequired: () => reject(new Error("New password required. Contact administrator.")),
        });
    });
}
/** Sign up a new user. */
export function signUp(email, password) {
    return new Promise((resolve, reject) => {
        if (!userPool)
            return reject(new Error("Auth not configured"));
        const attributes = [
            new CognitoUserAttribute({ Name: "email", Value: email }),
        ];
        userPool.signUp(email, password, attributes, [], (err) => {
            if (err)
                return reject(err);
            resolve();
        });
    });
}
/** Confirm sign-up with verification code. */
export function confirmSignUp(username, code) {
    return new Promise((resolve, reject) => {
        if (!userPool)
            return reject(new Error("Auth not configured"));
        const cognitoUser = new CognitoUser({
            Username: username,
            Pool: userPool,
        });
        cognitoUser.confirmRegistration(code, true, (err) => {
            if (err)
                return reject(err);
            resolve();
        });
    });
}
/** Get the current session if user is already logged in (from stored tokens). */
export function getCurrentSession() {
    return new Promise((resolve) => {
        if (!userPool)
            return resolve(null);
        const cognitoUser = userPool.getCurrentUser();
        if (!cognitoUser)
            return resolve(null);
        cognitoUser.getSession((err, session) => {
            if (err || !session || !session.isValid())
                return resolve(null);
            resolve(sessionToUser(session));
        });
    });
}
/** Refresh the current session and return fresh tokens. */
export function refreshSession() {
    return new Promise((resolve) => {
        if (!userPool)
            return resolve(null);
        const cognitoUser = userPool.getCurrentUser();
        if (!cognitoUser)
            return resolve(null);
        cognitoUser.getSession((err, session) => {
            if (err || !session)
                return resolve(null);
            const refreshToken = session.getRefreshToken();
            cognitoUser.refreshSession(refreshToken, (refreshErr, newSession) => {
                if (refreshErr || !newSession)
                    return resolve(null);
                resolve(sessionToUser(newSession));
            });
        });
    });
}
/** Sign out the current user. */
export function signOut() {
    const cognitoUser = userPool?.getCurrentUser();
    cognitoUser?.signOut();
}
/** Check if Cognito is configured (pool ID + client ID set). */
export function isAuthConfigured() {
    return Boolean(USER_POOL_ID && CLIENT_ID);
}
