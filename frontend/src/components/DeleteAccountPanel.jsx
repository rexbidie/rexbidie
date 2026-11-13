import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { useAuth } from '../contexts/AuthContext';
import { disableBiometric } from '../native/biometric';

/**
 * "Delete my account", in every profile (Security) and on /delete-account.
 * Apple and Google require apps to offer this.
 */
function DeleteAccountPanel() {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [checking, setChecking] = useState(false);
    const [blockers, setBlockers] = useState(null);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    const start = async () => {
        setOpen(true);
        setChecking(true);
        try {
            const { data } = await axiosInstance.get('/api/v1/users/me/deletion-check');
            setBlockers(data.data.blockers || []);
        } catch {
            toast.error('Could not check your account. Please try again.');
            setOpen(false);
        } finally {
            setChecking(false);
        }
    };

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await axiosInstance.post('/api/v1/users/me/delete', { password, confirm, reason: reason.trim() || undefined });
            await disableBiometric();
            logout();
            toast.success('Your account has been deleted');
            navigate('/');
        } catch (err) {
            const found = err.response?.data?.data?.blockers;
            if (found) setBlockers(found);
            toast.error(err.response?.data?.message || 'Could not delete your account');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-8 rounded-lg border border-red-200 p-5">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-red-700">
                <Trash2 size={20} /> Delete account
            </h3>
            <p className="text-sm text-gray-600 mt-2">
                Permanently delete your RexBid account. Your personal details, saved cards and ID documents are removed and you&rsquo;re
                signed out everywhere. Records of completed sales, receipts and payouts are kept as the law requires.
            </p>

            {!open && (
                <button type="button" onClick={start} className="mt-4 px-4 py-2 rounded-lg border border-red-300 text-red-700 font-medium hover:bg-red-50">
                    Delete my account…
                </button>
            )}

            {open && checking && (
                <p className="mt-4 flex items-center gap-2 text-sm text-gray-600"><Loader size={16} className="animate-spin" /> Checking your account…</p>
            )}

            {open && !checking && blockers?.length > 0 && (
                <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-4">
                    <p className="flex items-center gap-2 font-medium text-amber-900"><AlertTriangle size={18} /> Please finish these first</p>
                    <ul className="mt-2 list-disc pl-5 text-sm text-amber-900 space-y-1">
                        {blockers.map((b) => <li key={b.code}>{b.message}</li>)}
                    </ul>
                    <p className="text-sm text-amber-900 mt-2">
                        Need help? Email <a className="underline" href="mailto:admin@rexbid.ie">admin@rexbid.ie</a>.
                    </p>
                </div>
            )}

            {open && !checking && blockers?.length === 0 && (
                <form onSubmit={submit} className="mt-4 space-y-4">
                    <div>
                        <label htmlFor="delete-reason" className="block text-sm font-medium text-secondary mb-1">Why are you leaving? (optional)</label>
                        <textarea id="delete-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2}
                            className="w-full p-3 border border-gray-300 rounded-lg" />
                    </div>
                    <div>
                        <label htmlFor="delete-password" className="block text-sm font-medium text-secondary mb-1">Your password</label>
                        <input id="delete-password" type="password" autoComplete="current-password" required value={password}
                            onChange={(e) => setPassword(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg" />
                    </div>
                    <div>
                        <label htmlFor="delete-confirm" className="block text-sm font-medium text-secondary mb-1">Type DELETE to confirm</label>
                        <input id="delete-confirm" type="text" autoCapitalize="characters" required value={confirm}
                            onChange={(e) => setConfirm(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg" />
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button type="submit" disabled={busy || confirm !== 'DELETE' || !password}
                            className="px-4 py-2.5 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-50">
                            {busy ? 'Deleting…' : 'Permanently delete my account'}
                        </button>
                        <button type="button" onClick={() => setOpen(false)} className="px-4 py-2.5 rounded-lg border text-secondary font-medium">
                            Cancel
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

export default DeleteAccountPanel;
