import { Link } from 'react-router-dom';
import { Monitor } from 'lucide-react';
import { openExternal } from '../native/files';

/** Shown in the app for /admin pages: the admin dashboard is website-only. */
function AdminOnWebsite() {
    return (
        <section className="min-h-screen flex items-center justify-center px-6 py-16 bg-gray-50">
            <div className="max-w-sm w-full text-center bg-white border rounded-xl p-8">
                <Monitor className="mx-auto text-primary mb-4" size={40} />
                <h1 className="text-xl font-bold text-secondary">Admin is on the website</h1>
                <p className="text-gray-600 mt-2">
                    The admin dashboard isn&rsquo;t part of the app. Please use rexbid.ie on a computer to manage sales, payouts and listings.
                </p>
                <button
                    type="button"
                    onClick={() => openExternal('https://rexbid.ie/admin/dashboard')}
                    className="mt-6 w-full py-3 rounded-lg bg-primary text-white font-medium"
                >
                    Open rexbid.ie
                </button>
                <Link to="/" className="block mt-3 py-2 text-secondary font-medium">
                    Back to home
                </Link>
            </div>
        </section>
    );
}

export default AdminOnWebsite;
