import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, UserPlus, Shield, ShieldCheck, Mail, AlertTriangle, KeyRound, Copy, CheckCircle2, ChevronDown, MoreVertical, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import useNotification from '../hooks/useNotification';

export default function TeamPage({ apiBase }) {
  const { user, membership, hasPermission } = useAuth();
  const { notification, showNotification } = useNotification();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const res = await axios.get(`${apiBase}/auth/members`);
      setMembers(res.data);
    } catch (err) {
      showNotification('Failed to load team members', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await axios.patch(`${apiBase}/auth/members/${userId}/role`, { role: newRole });
      showNotification('Role updated successfully');
      fetchMembers();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Failed to update role', 'error');
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm("Are you sure you want to remove this member from the organization?")) return;
    try {
      await axios.delete(`${apiBase}/auth/members/${userId}`);
      showNotification('Member removed successfully');
      fetchMembers();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Failed to remove member', 'error');
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'super_admin': return <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-purple-100 text-purple-700 border border-purple-200">Super Admin</span>;
      case 'admin': return <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-brand-100 text-brand-700 border border-brand-200">Admin</span>;
      case 'editor': return <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-100 text-amber-700 border border-amber-200">Editor</span>;
      default: return <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 border border-slate-200">Viewer</span>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-serif text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-600" />
            Team Management
          </h2>
          <p className="text-sm text-slate-500 mt-1">Manage organization members and their roles.</p>
        </div>
        {hasPermission('members.manage') && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition flex items-center gap-2 shadow-sm"
          >
            <UserPlus className="w-4 h-4" /> Invite Member
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider font-semibold text-slate-500">
                <th className="p-4">User</th>
                <th className="p-4">Role</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="4" className="p-8 text-center text-slate-400">Loading members...</td></tr>
              ) : members.length === 0 ? (
                <tr><td colSpan="4" className="p-8 text-center text-slate-400">No members found.</td></tr>
              ) : (
                members.map(m => (
                  <tr key={m.user_id} className="hover:bg-slate-50/50 transition">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold">
                          {m.user?.name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 flex items-center gap-2">
                            {m.user?.name || 'Unknown User'}
                            {m.user_id === user.id && <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">You</span>}
                          </div>
                          <div className="text-sm text-slate-500">{m.user?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      {getRoleBadge(m.role)}
                    </td>
                    <td className="p-4">
                      <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                        <CheckCircle2 className="w-4 h-4" /> Active
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {membership.role === 'super_admin' ? (
                        <div className="flex items-center justify-end gap-2">
                          <div className="inline-block relative group">
                            <select 
                              className="appearance-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 pr-8 focus:outline-none focus:border-brand-500 cursor-pointer"
                              value={m.role}
                              onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                            >
                              {membership.role === 'super_admin' && <option value="super_admin">Super Admin</option>}
                              <option value="admin">Admin</option>
                              <option value="editor">Editor</option>
                              <option value="viewer">Viewer</option>
                            </select>
                            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2 pointer-events-none" />
                          </div>
                          {membership.role === 'super_admin' && m.user_id !== user.id && (
                            <button
                              onClick={() => handleRemoveMember(m.user_id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Remove Member"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-sm italic">No actions</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showInviteModal && (
        <InviteModal 
          apiBase={apiBase} 
          onClose={() => setShowInviteModal(false)} 
          onSuccess={() => { setShowInviteModal(false); fetchMembers(); }}
          membership={membership}
        />
      )}
    </div>
  );
}

function InviteModal({ apiBase, onClose, onSuccess, membership }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [successData, setSuccessData] = useState(null);

  const handleInvite = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const res = await axios.post(`${apiBase}/auth/invite`, { email, role });
      setSuccessData(res.data);
    } catch (error) {
      setErr(error.response?.data?.error || 'Failed to invite user');
    } finally {
      setLoading(false);
    }
  };

  const copyPassword = () => {
    if (successData?.temp_password) {
      navigator.clipboard.writeText(successData.temp_password);
      alert('Password copied to clipboard!');
    }
  };

  if (successData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200 text-center">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-bold font-serif text-slate-900 mb-2">Member Invited!</h3>
          <p className="text-slate-600 mb-6">{successData.message}</p>
          
          {successData.is_new_user && successData.temp_password && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left">
              <p className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4" /> Important: Temporary Password
              </p>
              <p className="text-xs text-amber-700 mb-3">
                Since this is a new user, a temporary password has been generated. Please copy and securely share it with them. They should change it upon login.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800">
                  {successData.temp_password}
                </code>
                <button onClick={copyPassword} className="p-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg transition" title="Copy Password">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          
          <button onClick={onSuccess} className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold transition">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
        <h3 className="text-xl font-bold font-serif text-slate-900 mb-1">Invite Team Member</h3>
        <p className="text-sm text-slate-500 mb-6">Send an invitation to join your workspace.</p>
        
        <form onSubmit={handleInvite} className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Email Address</span>
            <div className="mt-1 relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-brand-500 text-sm"
                placeholder="colleague@example.com"
              />
            </div>
          </label>
          
          <label className="block">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Assign Role</span>
            <div className="mt-1 relative">
              <Shield className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <select 
                value={role}
                onChange={e => setRole(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-brand-500 text-sm appearance-none bg-white cursor-pointer"
              >
                {membership?.role === 'super_admin' && <option value="super_admin">Super Admin (Full Access)</option>}
                <option value="admin">Admin (Manage events & certificates)</option>
                <option value="editor">Editor (Create & issue certificates)</option>
                <option value="viewer">Viewer (Read-only access)</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </label>
          
          {err && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {err}
            </div>
          )}
          
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold transition disabled:opacity-50">
              {loading ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
