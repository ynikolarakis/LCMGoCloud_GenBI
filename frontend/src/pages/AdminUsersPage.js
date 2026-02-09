import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listUsers, createUser, updateUser, deactivateUser, activateUser, deleteUser, adminResetPassword, } from "@/services/adminApi";
export function AdminUsersPage() {
    const queryClient = useQueryClient();
    const [showInactive, setShowInactive] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editUser, setEditUser] = useState(null);
    const [resetPasswordUser, setResetPasswordUser] = useState(null);
    const { data: users = [], isLoading } = useQuery({
        queryKey: ["admin-users", showInactive],
        queryFn: () => listUsers(showInactive),
    });
    const createMutation = useMutation({
        mutationFn: (data) => createUser(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            setShowCreateModal(false);
        },
    });
    const updateMutation = useMutation({
        mutationFn: ({ userId, data, }) => updateUser(userId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            setEditUser(null);
        },
    });
    const deactivateMutation = useMutation({
        mutationFn: deactivateUser,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
    });
    const activateMutation = useMutation({
        mutationFn: activateUser,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
    });
    const deleteMutation = useMutation({
        mutationFn: deleteUser,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
    });
    const resetPasswordMutation = useMutation({
        mutationFn: ({ userId, password }) => adminResetPassword(userId, password),
        onSuccess: () => setResetPasswordUser(null),
    });
    if (isLoading) {
        return _jsx("div", { className: "text-gray-500", children: "Loading users..." });
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("h2", { className: "text-lg font-medium text-gray-900", children: "Users" }), _jsxs("label", { className: "flex items-center gap-2 text-sm text-gray-600", children: [_jsx("input", { type: "checkbox", checked: showInactive, onChange: (e) => setShowInactive(e.target.checked), className: "rounded border-gray-300" }), "Show inactive"] })] }), _jsx("button", { onClick: () => setShowCreateModal(true), className: "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700", children: "Create User" })] }), _jsx("div", { className: "overflow-hidden rounded-lg border bg-white shadow-sm", children: _jsxs("table", { className: "min-w-full divide-y divide-gray-200", children: [_jsx("thead", { className: "bg-gray-50", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase text-gray-500", children: "Email" }), _jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase text-gray-500", children: "Name" }), _jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase text-gray-500", children: "Role" }), _jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase text-gray-500", children: "Status" }), _jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase text-gray-500", children: "Last Login" }), _jsx("th", { className: "px-4 py-3 text-right text-xs font-medium uppercase text-gray-500", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-200", children: users.map((user) => (_jsxs("tr", { className: !user.isActive ? "bg-gray-50" : "", children: [_jsx("td", { className: "whitespace-nowrap px-4 py-3 text-sm text-gray-900", children: user.email }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-sm text-gray-600", children: user.displayName || "-" }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-sm", children: _jsx("span", { className: `inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${user.isAdmin
                                                ? "bg-purple-100 text-purple-700"
                                                : "bg-gray-100 text-gray-700"}`, children: user.isAdmin ? "Admin" : "User" }) }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-sm", children: _jsx("span", { className: `inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${user.isActive
                                                ? "bg-green-100 text-green-700"
                                                : "bg-red-100 text-red-700"}`, children: user.isActive ? "Active" : "Inactive" }) }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-sm text-gray-500", children: user.lastLoginAt
                                            ? new Date(user.lastLoginAt).toLocaleString()
                                            : "Never" }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-right text-sm", children: _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { onClick: () => setEditUser(user), className: "text-blue-600 hover:text-blue-700", children: "Edit" }), _jsx("button", { onClick: () => setResetPasswordUser(user), className: "text-yellow-600 hover:text-yellow-700", children: "Reset PW" }), user.isActive ? (_jsx("button", { onClick: () => deactivateMutation.mutate(user.id), className: "text-orange-600 hover:text-orange-700", children: "Deactivate" })) : (_jsx("button", { onClick: () => activateMutation.mutate(user.id), className: "text-green-600 hover:text-green-700", children: "Activate" })), _jsx("button", { onClick: () => {
                                                        if (confirm(`Are you sure you want to delete ${user.email}? This cannot be undone.`)) {
                                                            deleteMutation.mutate(user.id);
                                                        }
                                                    }, className: "text-red-600 hover:text-red-700", children: "Delete" })] }) })] }, user.id))) })] }) }), showCreateModal && (_jsx(CreateUserModal, { onClose: () => setShowCreateModal(false), onCreate: (data) => createMutation.mutate(data), isLoading: createMutation.isPending, error: createMutation.error?.message })), editUser && (_jsx(EditUserModal, { user: editUser, onClose: () => setEditUser(null), onSave: (data) => updateMutation.mutate({ userId: editUser.id, data }), isLoading: updateMutation.isPending, error: updateMutation.error?.message })), resetPasswordUser && (_jsx(ResetPasswordModal, { user: resetPasswordUser, onClose: () => setResetPasswordUser(null), onReset: (password) => resetPasswordMutation.mutate({
                    userId: resetPasswordUser.id,
                    password,
                }), isLoading: resetPasswordMutation.isPending, error: resetPasswordMutation.error?.message }))] }));
}
// Create User Modal
function CreateUserModal({ onClose, onCreate, isLoading, error, }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [sessionHours, setSessionHours] = useState(24);
    const handleSubmit = (e) => {
        e.preventDefault();
        onCreate({
            email,
            password,
            display_name: displayName || undefined,
            is_admin: isAdmin,
            session_lifetime_hours: sessionHours,
        });
    };
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", children: _jsxs("div", { className: "w-full max-w-md rounded-lg bg-white p-6 shadow-xl", children: [_jsx("h3", { className: "mb-4 text-lg font-medium text-gray-900", children: "Create User" }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Email *" }), _jsx("input", { type: "email", required: true, value: email, onChange: (e) => setEmail(e.target.value), className: "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Password *" }), _jsx("input", { type: "password", required: true, minLength: 8, value: password, onChange: (e) => setPassword(e.target.value), className: "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Display Name" }), _jsx("input", { type: "text", value: displayName, onChange: (e) => setDisplayName(e.target.value), className: "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Session Lifetime (hours)" }), _jsx("input", { type: "number", min: 1, max: 8760, value: sessionHours, onChange: (e) => setSessionHours(parseInt(e.target.value)), className: "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" })] }), _jsxs("label", { className: "flex items-center gap-2", children: [_jsx("input", { type: "checkbox", checked: isAdmin, onChange: (e) => setIsAdmin(e.target.checked), className: "rounded border-gray-300" }), _jsx("span", { className: "text-sm text-gray-700", children: "Admin privileges" })] }), error && _jsx("p", { className: "text-sm text-red-600", children: error }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { type: "button", onClick: onClose, className: "rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50", children: "Cancel" }), _jsx("button", { type: "submit", disabled: isLoading, className: "rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50", children: isLoading ? "Creating..." : "Create" })] })] })] }) }));
}
// Edit User Modal
function EditUserModal({ user, onClose, onSave, isLoading, error, }) {
    const [displayName, setDisplayName] = useState(user.displayName || "");
    const [isAdmin, setIsAdmin] = useState(user.isAdmin);
    const [sessionHours, setSessionHours] = useState(user.sessionLifetimeHours);
    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            display_name: displayName || undefined,
            is_admin: isAdmin,
            session_lifetime_hours: sessionHours,
        });
    };
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", children: _jsxs("div", { className: "w-full max-w-md rounded-lg bg-white p-6 shadow-xl", children: [_jsxs("h3", { className: "mb-4 text-lg font-medium text-gray-900", children: ["Edit User: ", user.email] }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Display Name" }), _jsx("input", { type: "text", value: displayName, onChange: (e) => setDisplayName(e.target.value), className: "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Session Lifetime (hours)" }), _jsx("input", { type: "number", min: 1, max: 8760, value: sessionHours, onChange: (e) => setSessionHours(parseInt(e.target.value)), className: "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" })] }), _jsxs("label", { className: "flex items-center gap-2", children: [_jsx("input", { type: "checkbox", checked: isAdmin, onChange: (e) => setIsAdmin(e.target.checked), className: "rounded border-gray-300" }), _jsx("span", { className: "text-sm text-gray-700", children: "Admin privileges" })] }), error && _jsx("p", { className: "text-sm text-red-600", children: error }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { type: "button", onClick: onClose, className: "rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50", children: "Cancel" }), _jsx("button", { type: "submit", disabled: isLoading, className: "rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50", children: isLoading ? "Saving..." : "Save" })] })] })] }) }));
}
// Reset Password Modal
function ResetPasswordModal({ user, onClose, onReset, isLoading, error, }) {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [validationError, setValidationError] = useState(null);
    const handleSubmit = (e) => {
        e.preventDefault();
        setValidationError(null);
        if (password !== confirmPassword) {
            setValidationError("Passwords do not match");
            return;
        }
        if (password.length < 8) {
            setValidationError("Password must be at least 8 characters");
            return;
        }
        onReset(password);
    };
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", children: _jsxs("div", { className: "w-full max-w-md rounded-lg bg-white p-6 shadow-xl", children: [_jsxs("h3", { className: "mb-4 text-lg font-medium text-gray-900", children: ["Reset Password: ", user.email] }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "New Password" }), _jsx("input", { type: "password", required: true, minLength: 8, value: password, onChange: (e) => setPassword(e.target.value), className: "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Confirm Password" }), _jsx("input", { type: "password", required: true, value: confirmPassword, onChange: (e) => setConfirmPassword(e.target.value), className: "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" })] }), (validationError || error) && (_jsx("p", { className: "text-sm text-red-600", children: validationError || error })), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { type: "button", onClick: onClose, className: "rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50", children: "Cancel" }), _jsx("button", { type: "submit", disabled: isLoading, className: "rounded-md bg-yellow-600 px-4 py-2 text-sm text-white hover:bg-yellow-700 disabled:opacity-50", children: isLoading ? "Resetting..." : "Reset Password" })] })] })] }) }));
}
