# Decision: POC Platform Auth Integration

## Date: 2026-02-04

## Status: Accepted

## Context

The POC (Proof of Concept) sharing feature (ADR 0016) originally used a separate password-based authentication system. Each POC had its own password that external users would enter to access the demo.

With the introduction of the local database authentication system (ADR 0018), we now have platform-level user management. This creates a conflict:
1. POC users needed a separate password to access POCs
2. Platform users log in with email/password
3. Users who are both platform users AND POC users had to authenticate twice

Additionally, there was no way to restrict non-admin platform users to only see specific POCs.

## Decision

Replace POC password authentication with platform authentication:

1. **Remove POC passwords** - POCs no longer have their own passwords (migration 024 makes `password_hash` nullable)

2. **Introduce POC User Groups** - Each POC has an associated user group (migration 023):
   - `poc_user_groups` table (1:1 with POC)
   - `poc_group_members` table (many-to-many: users ↔ groups)
   - Group auto-created when POC is created

3. **Access control rules**:
   - Admin users can access ANY POC
   - Non-admin users can only access POCs where they are group members
   - Unauthenticated users are redirected to login

4. **Auto-deactivation of orphaned users**:
   - When a POC is deleted or a user is removed from a group
   - If the user is non-admin AND has no remaining POC group memberships
   - The user is automatically deactivated (`is_active = false`)
   - Prevents orphaned demo users from accessing the full platform

## Implementation

### Backend Changes

- `api/poc.py`:
  - Removed `/auth` endpoint
  - Added `/check-access` endpoint
  - Updated `info`, `query`, `query/stream` to use platform auth
  - `create_poc` no longer requires password

- `repositories/poc_group_repository.py`:
  - `create_group()`, `add_member()`, `remove_member()`
  - `is_user_in_poc_group()`, `count_user_poc_memberships()`
  - `get_non_admin_users_in_poc()`

- `services/poc_manager.py`:
  - Auto-creates user group on POC creation
  - `delete_poc()` returns list of deactivated users

- `api/admin.py`:
  - POC group management endpoints
  - Auto-deactivation on member removal

### Frontend Changes

- Removed `PocPasswordPrompt.tsx` component
- `PocChatPage.tsx`: Uses `useAuthStore`, redirects to login if not authenticated
- `pocApi.ts`: All requests use platform auth headers
- `SharePocModal.tsx`: Removed password fields
- `AdminPocGroupsPage.tsx`: New page for managing POC group members

### Database Migrations

- **023**: Create `poc_user_groups` and `poc_group_members` tables
- **024**: `ALTER TABLE poc_instances ALTER COLUMN password_hash DROP NOT NULL`

## Consequences

### Positive
- Single sign-on: Users log in once to access platform AND POCs
- Centralized user management via Admin panel
- Clear audit trail of who accessed what
- Automatic cleanup of orphaned demo users
- Admins can preview any POC without needing passwords

### Negative
- External users without platform accounts can no longer access POCs (they need to be created as users first)
- Slightly more admin work to create user + add to group (vs just sharing password)

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Orphaned users access full platform | Auto-deactivation when no POC access remains |
| Admin forgets to add user to group | Clear message in SharePocModal pointing to POC Groups |
| Existing POCs with passwords | Migration makes password nullable; old POCs work but passwords ignored |

## API Changes

### Removed
- `POST /api/v1/poc/{id}/auth` - No longer needed

### Added
- `GET /api/v1/poc/{id}/check-access` - Returns `{can_access, reason}`
- `GET /api/v1/admin/poc-groups` - List all POC groups
- `GET /api/v1/admin/poc-groups/{poc_id}` - Get POC group
- `GET /api/v1/admin/poc-groups/{poc_id}/members` - List members
- `POST /api/v1/admin/poc-groups/{poc_id}/members` - Add member
- `DELETE /api/v1/admin/poc-groups/{poc_id}/members/{user_id}` - Remove member

### Modified
- `POST /api/v1/connections/{id}/poc` - No longer requires `password` field
- `DELETE /api/v1/poc/{id}` - Returns `{status, deactivated_users[]}`
