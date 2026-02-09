/** Admin page for managing POC user groups. */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listPocGroups,
  getPocGroup,
  listPocGroupMembers,
  addPocGroupMember,
  removePocGroupMember,
  listUsers,
} from "@/services/adminApi";

export default function AdminPocGroupsPage() {
  const queryClient = useQueryClient();
  const [selectedPocId, setSelectedPocId] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    mutationFn: ({ pocId, userId }: { pocId: string; userId: string }) =>
      addPocGroupMember(pocId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "poc-groups"] });
      setShowAddMember(false);
      setSelectedUserId("");
      setSuccess("Member added successfully");
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to add member");
      setSuccess(null);
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: ({ pocId, userId }: { pocId: string; userId: string }) =>
      removePocGroupMember(pocId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "poc-groups"] });
      setSuccess("Member removed successfully");
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to remove member");
      setSuccess(null);
    },
  });

  // Filter out users who are already members
  const availableUsers = allUsers.filter(
    (user) => !members.some((m) => m.userId === user.id)
  );

  const handleAddMember = () => {
    if (selectedPocId && selectedUserId) {
      addMemberMutation.mutate({ pocId: selectedPocId, userId: selectedUserId });
    }
  };

  const handleRemoveMember = (userId: string) => {
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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">POC User Groups</h1>

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-4 p-3 bg-green-100 text-green-800 rounded">
          {success}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* POC Groups List */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">POC Groups</h2>
          {groupsLoading ? (
            <p className="text-gray-500">Loading groups...</p>
          ) : groups.length === 0 ? (
            <p className="text-gray-500">No POC groups found</p>
          ) : (
            <ul className="divide-y">
              {groups.map((group) => (
                <li
                  key={group.id}
                  className={`p-3 cursor-pointer hover:bg-gray-50 ${
                    selectedPocId === group.pocId ? "bg-blue-50" : ""
                  }`}
                  onClick={() => setSelectedPocId(group.pocId)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{group.name}</p>
                      <p className="text-sm text-gray-500">
                        {group.memberCount} member
                        {group.memberCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <span className="text-gray-400">&rarr;</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Group Members */}
        <div className="bg-white rounded-lg shadow p-4">
          {selectedPocId ? (
            <>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">
                  {selectedGroup?.name || "Members"}
                </h2>
                <button
                  onClick={() => setShowAddMember(true)}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                  Add Member
                </button>
              </div>

              {/* Add Member Modal */}
              {showAddMember && (
                <div className="mb-4 p-4 bg-gray-50 rounded border">
                  <h3 className="font-medium mb-2">Add Member</h3>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full border rounded px-3 py-2 mb-2"
                  >
                    <option value="">Select a user...</option>
                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.email}
                        {user.displayName ? ` (${user.displayName})` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddMember}
                      disabled={!selectedUserId || addMemberMutation.isPending}
                      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50"
                    >
                      {addMemberMutation.isPending ? "Adding..." : "Add"}
                    </button>
                    <button
                      onClick={() => {
                        setShowAddMember(false);
                        setSelectedUserId("");
                      }}
                      className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Members List */}
              {membersLoading ? (
                <p className="text-gray-500">Loading members...</p>
              ) : members.length === 0 ? (
                <p className="text-gray-500">No members in this group</p>
              ) : (
                <ul className="divide-y">
                  {members.map((member) => (
                    <li
                      key={member.id}
                      className="p-3 flex justify-between items-center"
                    >
                      <div>
                        <p className="font-medium">{member.userEmail}</p>
                        {member.userDisplayName && (
                          <p className="text-sm text-gray-500">
                            {member.userDisplayName}
                          </p>
                        )}
                        <p className="text-xs text-gray-400">
                          Added {new Date(member.addedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveMember(member.userId)}
                        disabled={removeMemberMutation.isPending}
                        className="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-sm"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-gray-500">Select a POC group to view members</p>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-800 mb-2">How POC Groups Work</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>
            - A POC group is automatically created when you create a POC from a
            connection
          </li>
          <li>
            - Add users to a POC group to give them access to only that POC
            (not the full admin interface)
          </li>
          <li>
            - Users in a POC group who are not admins will be redirected to
            their POC when they log in
          </li>
          <li>
            - Admin users have full access regardless of POC group membership
          </li>
        </ul>
      </div>
    </div>
  );
}
