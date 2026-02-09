import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Admin page for managing POC user groups. */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listPocGroups, getPocGroup, listPocGroupMembers, addPocGroupMember, removePocGroupMember, listUsers, } from "@/services/adminApi";
export default function AdminPocGroupsPage() {
    const queryClient = useQueryClient();
    const [selectedPocId, setSelectedPocId] = useState(null);
    const [showAddMember, setShowAddMember] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState("");
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    // Fetch all POC groups
    const { data: groups = [], isLoading: groupsLoading } = useQuery({
        queryKey: ["admin", "poc-groups"],
        queryFn: listPocGroups,
    });
    // Fetch selected group details
    const { data: selectedGroup } = useQuery({
        queryKey: ["admin", "poc-groups", selectedPocId],
        queryFn: () => (selectedPocId ? getPocGroup(selectedPocId) : null),
        enabled: !!selectedPocId,
    });
    // Fetch members of selected group
    const { data: members = [], isLoading: membersLoading } = useQuery({
        queryKey: ["admin", "poc-groups", selectedPocId, "members"],
        queryFn: () => (selectedPocId ? listPocGroupMembers(selectedPocId) : []),
        enabled: !!selectedPocId,
    });
    // Fetch all users for adding members
    const { data: allUsers = [] } = useQuery({
        queryKey: ["admin", "users"],
        queryFn: () => listUsers(false),
        enabled: showAddMember,
    });
    // Add member mutation
    const addMemberMutation = useMutation({
        mutationFn: ({ pocId, userId }) => addPocGroupMember(pocId, userId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin", "poc-groups"] });
            setShowAddMember(false);
            setSelectedUserId("");
            setSuccess("Member added successfully");
            setError(null);
        },
        onError: (err) => {
            setError(err.message || "Failed to add member");
            setSuccess(null);
        },
    });
    // Remove member mutation
    const removeMemberMutation = useMutation({
        mutationFn: ({ pocId, userId }) => removePocGroupMember(pocId, userId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin", "poc-groups"] });
            setSuccess("Member removed successfully");
            setError(null);
        },
        onError: (err) => {
            setError(err.message || "Failed to remove member");
            setSuccess(null);
        },
    });
    // Filter out users who are already members
    const availableUsers = allUsers.filter((user) => !members.some((m) => m.userId === user.id));
    const handleAddMember = () => {
        if (selectedPocId && selectedUserId) {
            addMemberMutation.mutate({ pocId: selectedPocId, userId: selectedUserId });
        }
    };
    const handleRemoveMember = (userId) => {
        if (selectedPocId && confirm("Remove this member from the POC group?")) {
            removeMemberMutation.mutate({ pocId: selectedPocId, userId });
        }
    };
    // Clear messages after 3 seconds
    useEffect(() => {
        if (success || error) {
            const timer = setTimeout(() => {
                setSuccess(null);
                setError(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [success, error]);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-bold mb-6", children: "POC User Groups" }), success && (_jsx("div", { className: "mb-4 p-3 bg-green-100 text-green-800 rounded", children: success })), error && (_jsx("div", { className: "mb-4 p-3 bg-red-100 text-red-800 rounded", children: error })), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [_jsxs("div", { className: "bg-white rounded-lg shadow p-4", children: [_jsx("h2", { className: "text-lg font-semibold mb-4", children: "POC Groups" }), groupsLoading ? (_jsx("p", { className: "text-gray-500", children: "Loading groups..." })) : groups.length === 0 ? (_jsx("p", { className: "text-gray-500", children: "No POC groups found" })) : (_jsx("ul", { className: "divide-y", children: groups.map((group) => (_jsx("li", { className: `p-3 cursor-pointer hover:bg-gray-50 ${selectedPocId === group.pocId ? "bg-blue-50" : ""}`, onClick: () => setSelectedPocId(group.pocId), children: _jsxs("div", { className: "flex justify-between items-center", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium", children: group.name }), _jsxs("p", { className: "text-sm text-gray-500", children: [group.memberCount, " member", group.memberCount !== 1 ? "s" : ""] })] }), _jsx("span", { className: "text-gray-400", children: "\u2192" })] }) }, group.id))) }))] }), _jsx("div", { className: "bg-white rounded-lg shadow p-4", children: selectedPocId ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsx("h2", { className: "text-lg font-semibold", children: selectedGroup?.name || "Members" }), _jsx("button", { onClick: () => setShowAddMember(true), className: "px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm", children: "Add Member" })] }), showAddMember && (_jsxs("div", { className: "mb-4 p-4 bg-gray-50 rounded border", children: [_jsx("h3", { className: "font-medium mb-2", children: "Add Member" }), _jsxs("select", { value: selectedUserId, onChange: (e) => setSelectedUserId(e.target.value), className: "w-full border rounded px-3 py-2 mb-2", children: [_jsx("option", { value: "", children: "Select a user..." }), availableUsers.map((user) => (_jsxs("option", { value: user.id, children: [user.email, user.displayName ? ` (${user.displayName})` : ""] }, user.id)))] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: handleAddMember, disabled: !selectedUserId || addMemberMutation.isPending, className: "px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50", children: addMemberMutation.isPending ? "Adding..." : "Add" }), _jsx("button", { onClick: () => {
                                                        setShowAddMember(false);
                                                        setSelectedUserId("");
                                                    }, className: "px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm", children: "Cancel" })] })] })), membersLoading ? (_jsx("p", { className: "text-gray-500", children: "Loading members..." })) : members.length === 0 ? (_jsx("p", { className: "text-gray-500", children: "No members in this group" })) : (_jsx("ul", { className: "divide-y", children: members.map((member) => (_jsxs("li", { className: "p-3 flex justify-between items-center", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium", children: member.userEmail }), member.userDisplayName && (_jsx("p", { className: "text-sm text-gray-500", children: member.userDisplayName })), _jsxs("p", { className: "text-xs text-gray-400", children: ["Added ", new Date(member.addedAt).toLocaleDateString()] })] }), _jsx("button", { onClick: () => handleRemoveMember(member.userId), disabled: removeMemberMutation.isPending, className: "px-2 py-1 text-red-600 hover:bg-red-50 rounded text-sm", children: "Remove" })] }, member.id))) }))] })) : (_jsx("p", { className: "text-gray-500", children: "Select a POC group to view members" })) })] }), _jsxs("div", { className: "mt-6 p-4 bg-blue-50 rounded-lg", children: [_jsx("h3", { className: "font-semibold text-blue-800 mb-2", children: "How POC Groups Work" }), _jsxs("ul", { className: "text-sm text-blue-700 space-y-1", children: [_jsx("li", { children: "- A POC group is automatically created when you create a POC from a connection" }), _jsx("li", { children: "- Add users to a POC group to give them access to only that POC (not the full admin interface)" }), _jsx("li", { children: "- Users in a POC group who are not admins will be redirected to their POC when they log in" }), _jsx("li", { children: "- Admin users have full access regardless of POC group membership" })] })] })] }));
}
