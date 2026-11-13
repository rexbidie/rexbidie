import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DeleteAccountPanel from '../components/DeleteAccountPanel';

/**
 * Public page explaining how to delete a RexBid account (Google Play asks for
 * a web link). Signed-in users can delete straight from here.
 */
function DeleteAccount() {
    const { user } = useAuth();
    return (
        <section className="max-w-2xl mx-auto px-4 pt-32 pb-32 min-h-screen">
            <h1 className="text-3xl font-bold text-secondary">Delete your RexBid account</h1>
            <p className="text-gray-700 mt-4">
                You can delete your account at any time, from the website or the RexBid app: go to your <strong>Profile</strong>,
                open <strong>Security</strong>, and choose <strong>Delete my account</strong>.
            </p>

            <h2 className="text-xl font-semibold text-secondary mt-8">What is deleted</h2>
            <ul className="list-disc pl-5 mt-2 text-gray-700 space-y-1">
                <li>Your name, contact details, address and profile photo</li>
                <li>Saved payment cards and payout details</li>
                <li>Identity documents you uploaded</li>
                <li>Your watchlist, reminders, notifications and app sign-ins</li>
            </ul>

            <h2 className="text-xl font-semibold text-secondary mt-6">What is kept</h2>
            <p className="text-gray-700 mt-2">
                Records of completed sales (payment requests, receipts, statements and payouts) are kept for as long as Irish law requires
                for accounting and tax (normally 6 years). Questions and answers you posted stay on listings, shown as &ldquo;Deleted user&rdquo;.
            </p>

            <h2 className="text-xl font-semibold text-secondary mt-6">Before you delete</h2>
            <p className="text-gray-700 mt-2">
                Live or upcoming listings, leading bids on live lots, open offers and unfinished sales or payouts need to be finished first.
            </p>

            {user ? (
                <DeleteAccountPanel />
            ) : (
                <div className="mt-8 rounded-lg border p-5 bg-white">
                    <p className="text-gray-700">
                        <Link to="/login" className="text-primary font-semibold underline">Sign in</Link> to delete your account, or email{' '}
                        <a href="mailto:admin@rexbid.ie?subject=Delete%20my%20account" className="text-primary font-semibold underline">admin@rexbid.ie</a>{' '}
                        from the address on your account and we&rsquo;ll delete it within 30 days.
                    </p>
                </div>
            )}
        </section>
    );
}

export default DeleteAccount;
