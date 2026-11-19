import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Mail, Lock, Eye, EyeOff, User, ChevronDown, X } from 'lucide-react';
import { darkLogo } from '../assets';
import { toast } from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { useAuth } from '../contexts/AuthContext';
import { getGaClientId, trackEvent } from '../utils/ga.js';
import { trackMetaRegistration } from '../utils/metaPixel.js';
import { isNativeApp } from '../native/platform';
import EmailCodeForm from './auth/EmailCodeForm';
import ForgotPasswordModal from './ForgotPasswordModal';
import { hasAccountOnDevice } from '../utils/accountHint.js';

// "Where are you based?" → what the server needs for VAT region and currency.
const BASED_IN = {
    ROI: { label: 'Republic of Ireland', countryCode: 'IE', countryName: 'Ireland', currency: 'EUR' },
    NI: { label: 'Northern Ireland', countryCode: 'GB', countryName: 'Northern Ireland', currency: 'GBP' },
    GB: { label: 'England, Scotland or Wales', countryCode: 'GB', countryName: 'United Kingdom', currency: 'GBP' },
};

const AuthBidModal = ({ isOpen, onClose, onAuthSuccess, pendingAction }) => {
    // Most people who hit this popup are new, so open on "Create account" unless this
    // browser has signed in before. Opening on "Log in" sent ~1 in 5 people into a
    // "no account" / "already exists" error in the first week of tracking.
    const [activeTab, setActiveTab] = useState(() => (hasAccountOnDevice() ? 'login' : 'register'));
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    // Email still to confirm with the 6-digit code (after sign-up, or a login before confirming).
    const [verifyEmailFor, setVerifyEmailFor] = useState(null);
    const { setUser } = useAuth();
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Funnel tracking: the login/register wall shown when a guest tries to bid/offer
    const gateAction = pendingAction?.type || 'bid';
    useEffect(() => {
        if (isOpen) {
            const initialTab = hasAccountOnDevice() ? 'login' : 'register';
            setActiveTab(initialTab);
            trackEvent('bid_auth_gate_view', { action: gateAction, auth_tab: initialTab });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const handleClose = () => {
        trackEvent('bid_auth_gate_abandon', {
            action: gateAction,
            auth_tab: activeTab,
            stage: verifyEmailFor ? 'email_code' : 'form',
        });
        onClose();
    };

    // ---------- LOGIN ----------
    const {
        register: loginRegister,
        handleSubmit: handleLoginSubmit,
        setValue: loginSetValue,
        formState: { errors: loginErrors },
    } = useForm({ defaultValues: { email: '', password: '' } });

    const onLogin = async (data) => {
        try {
            setIsLoading(true);
            const res = await axiosInstance.post(
                `/api/v1/users/login`,
                {
                    email: data.email.toLowerCase().trim(),
                    password: data.password,
                    gaClientId: getGaClientId() || '',
                    rememberMe: isNativeApp,
                },
                { withCredentials: true }
            );

            if (res.data.success) {
                const { user, accessToken, refreshToken } = res.data.data;
                localStorage.setItem('accessToken', accessToken);
                localStorage.setItem('refreshToken', refreshToken);
                localStorage.setItem('user', JSON.stringify(user));
                setUser(user);
                toast.success('Logged in successfully');
                trackEvent('bid_auth_gate_complete', { action: gateAction, auth_method: 'login' });
                onAuthSuccess(user);
            }
        } catch (err) {
            const msg = err?.response?.data?.message || '';

            if (err?.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
                toast(msg, { duration: 8000 });
                setVerifyEmailFor({ email: err.response.data.email, isNew: false });
                return;
            }

            // Account doesn't exist → switch to Register tab, prefill email
            if (/no user found|user.*not.*found|not.*exist/i.test(msg)) {
                trackEvent('bid_auth_gate_error', { action: gateAction, auth_method: 'login', reason: 'no_account' });
                toast.error('No account with that email yet. Create one below, it only takes a minute.');
                regSetValue('email', data.email.toLowerCase().trim());
                regSetValue('password', '');
                setActiveTab('register');
                return;
            }

            // Everything else (wrong password, server error, etc.) → normal toast
            trackEvent('bid_auth_gate_error', {
                action: gateAction,
                auth_method: 'login',
                reason: err?.response?.status === 401 ? 'bad_credentials' : `http_${err?.response?.status || 'network'}`,
            });
            toast.error(msg || 'Login failed');
        } finally {
            setIsLoading(false);
        }
    };

    // ---------- REGISTER ----------
    const {
        register: regRegister,
        handleSubmit: handleRegSubmit,
        setValue: regSetValue,
        formState: { errors: regErrors },
    } = useForm({
        defaultValues: {
            email: '', phone: '', password: '', confirmPassword: '',
            username: '', firstName: '', lastName: '',
            line1: '', line2: '', county: '', postCode: '',
            country: 'ROI', currency: 'EUR', userType: 'bidder',
            companyName: '', companyVATNumber: '', termsConditions: false,
        },
    });


    const onRegister = async (data) => {
        try {
            setIsLoading(true);

            const formData = new FormData();
            formData.append('firstName', data.firstName);
            formData.append('lastName', data.lastName);
            formData.append('email', data.email.toLowerCase().trim());
            formData.append('phone', data.phone || '');
            formData.append('password', data.password);
            formData.append('username', data.username);
            formData.append('userType', data.userType);
            const based = BASED_IN[data.country] || BASED_IN.ROI;
            formData.append('countryCode', based.countryCode);
            formData.append('countryName', based.countryName);
            // Currency follows where they're based; it can be changed later in the profile.
            formData.append('currency', based.currency);
            formData.append('line1', data.line1 || '');
            formData.append('line2', data.line2 || '');
            formData.append('county', data.county || '');
            formData.append('state', data.state || '');
            formData.append('postCode', data.postCode || '');
            formData.append('gaClientId', getGaClientId() || '');

            if (data.userType === 'company') {
                formData.append('companyName', data.companyName || '');
                formData.append('companyVATNumber', data.companyVATNumber || '');
            }

            const res = await axiosInstance.post(
                `/api/v1/users/register`,
                formData,
                {
                    withCredentials: true,
                    headers: { 'Content-Type': 'multipart/form-data' },
                }
            );

            const body = res.data;
            if (body.requiresEmailVerification) {
                toast.success(body.message);
                setVerifyEmailFor({ email: body.data.email, isNew: true });
                return;
            }
            const { user, accessToken, refreshToken } = body.data;
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            localStorage.setItem('user', JSON.stringify(user));
            setUser(user);

            // GA + Meta (mirror Register.jsx)
            trackMetaRegistration(user.userType, user.currency);
            if (typeof window.gtag === 'function') {
                window.gtag('event', 'sign_up', {
                    user_type: user.userType,
                    method: 'email',
                });
            }

            toast.success('Account created 🎉');
            trackEvent('bid_auth_gate_complete', { action: gateAction, auth_method: 'register' });
            onAuthSuccess(user);
        } catch (err) {
            const msg = err?.response?.data?.message || '';
            if (err?.response?.data?.code === 'EMAIL_EXISTS' || /already exists/i.test(msg)) {
                trackEvent('bid_auth_gate_error', { action: gateAction, auth_method: 'register', reason: 'already_exists' });
                toast.error('You already have an account with that email. Log in instead.');
                loginSetValue('email', data.email.toLowerCase().trim());
                loginSetValue('password', '');
                setActiveTab('login');
                return;
            }
            trackEvent('bid_auth_gate_error', {
                action: gateAction,
                auth_method: 'register',
                reason: `http_${err?.response?.status || 'network'}`,
            });
            toast.error(msg || 'Registration failed');
        } finally {
            // Without this the button stays stuck on "Creating account…" after any failed attempt
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    const amountLabel = pendingAction?.amount
        ? `${pendingAction.type === 'offer' ? 'Offer' : 'Bid'}: €${pendingAction.amount}`
        : 'Sign in to continue';

    return (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6">
                    <div className="flex items-center gap-3">
                        <img src={darkLogo} alt="logo" className="h-8" />
                        <span className="text-sm text-gray-500">{amountLabel}</span>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-full">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-6 mt-4 flex border-b">
                    {[['register', 'Create account'], ['login', 'Log in']].map(([tab, label]) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${activeTab === tab
                                ? 'border-[#D19F3E] text-[#D19F3E]'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto">
                    {verifyEmailFor && (
                        <div className="py-2">
                            <h3 className="text-lg font-semibold text-[#072342] mb-3">Confirm your email</h3>
                            <EmailCodeForm
                                compact
                                context="bid_popup"
                                email={verifyEmailFor.email}
                                onVerified={(data) => {
                                    const { user, accessToken, refreshToken } = data.data;
                                    localStorage.setItem('accessToken', accessToken);
                                    localStorage.setItem('refreshToken', refreshToken);
                                    localStorage.setItem('user', JSON.stringify(user));
                                    setUser(user);
                                    if (verifyEmailFor.isNew) {
                                        trackMetaRegistration(user.userType, user.currency);
                                        if (typeof window.gtag === 'function') window.gtag('event', 'sign_up', { user_type: user.userType, method: 'email' });
                                    }
                                    toast.success(data.message || 'Email confirmed');
                                    // Account confirmed via the email code: count it as getting through the popup
                                    trackEvent('bid_auth_gate_complete', {
                                        action: gateAction,
                                        auth_method: verifyEmailFor.isNew ? 'register' : 'login',
                                        via: 'email_code',
                                    });
                                    setVerifyEmailFor(null);
                                    onAuthSuccess(user);
                                }}
                            />
                        </div>
                    )}
                    {!verifyEmailFor && activeTab === 'login' && (
                        <form onSubmit={handleLoginSubmit(onLogin)} className="space-y-4">
                            <Field label="Email" icon={<User size={18} />}>
                                <input
                                    type="email"
                                    {...loginRegister('email', { required: 'Email required' })}
                                    className="w-full pl-10 pr-3 py-3 border rounded-lg"
                                    placeholder="you@example.com"
                                />
                            </Field>
                            {loginErrors.email && <p className="text-red-500 text-xs">{loginErrors.email.message}</p>}

                            <Field label="Password" icon={<Lock size={18} />}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    {...loginRegister('password', { required: 'Password required' })}
                                    className="w-full pl-10 pr-10 py-3 border rounded-lg"
                                    placeholder="••••••••"
                                />
                                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-3">
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </Field>
                            {loginErrors.password && <p className="text-red-500 text-xs">{loginErrors.password.message}</p>}

                            <div className="text-right -mt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        trackEvent('bid_auth_gate_forgot_password', { action: gateAction });
                                        setShowForgotPassword(true);
                                    }}
                                    className="text-sm font-medium text-[#A17B35] underline"
                                >
                                    Forgot password?
                                </button>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-gradient-to-r from-[#D19F3E] to-[#E8B86B] text-white py-3 rounded-lg font-semibold disabled:opacity-50"
                            >
                                {isLoading ? 'Signing in…' : 'Sign In'}
                            </button>
                        </form>
                    )}

                    {!verifyEmailFor && activeTab === 'register' && (
                        <form onSubmit={handleRegSubmit(onRegister)} className="space-y-4">
                            {/* Short form: only what's needed to bid. Phone and address are asked for
                                later (when they're needed for a sale), not before the first bid. */}
                            <div className="grid grid-cols-2 gap-3">
                                <Input label="First name *" placeholder="First name" autoComplete="given-name" error={regErrors.firstName?.message}
                                    {...regRegister('firstName', { required: 'Required' })} />
                                <Input label="Last name *" placeholder="Last name" autoComplete="family-name" error={regErrors.lastName?.message}
                                    {...regRegister('lastName', { required: 'Required' })} />
                            </div>

                            <Input label="Email *" type="email" placeholder="you@example.com" autoComplete="email" icon={<Mail size={18} />} error={regErrors.email?.message}
                                {...regRegister('email', { required: 'Email required' })} />

                            <div>
                                <label className="text-xs font-medium">Password *</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="new-password"
                                        {...regRegister('password', { required: 'Password required', minLength: { value: 6, message: 'At least 6 characters' } })}
                                        className="w-full pl-3 pr-10 py-3 border rounded-lg text-sm"
                                        placeholder="At least 6 characters"
                                    />
                                    <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-3" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                                {regErrors.password && <p className="text-red-500 text-xs mt-1">{regErrors.password.message}</p>}
                            </div>

                            <div>
                                {/* One question instead of country + county + post code: it sets the
                                    VAT region (utils/region.js on the server) and the currency. */}
                                <label className="text-xs font-medium">Where are you based? *</label>
                                <div className="relative">
                                    <select
                                        {...regRegister('country', { required: 'Required' })}
                                        className="w-full p-3 border rounded-lg text-sm appearance-none"
                                    >
                                        {Object.entries(BASED_IN).map(([key, b]) => (
                                            <option key={key} value={key}>{b.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} className="absolute right-3 top-4 text-gray-400 pointer-events-none" />
                                </div>
                            </div>

                            <label className="flex items-start gap-2 text-xs text-gray-600">
                                <input type="checkbox" {...regRegister('termsConditions', { required: true })} />
                                <span>I agree to RexBid’s Terms of Use and Privacy Policy.</span>
                            </label>
                            {regErrors.termsConditions && <p className="text-red-500 text-xs">You must accept the terms.</p>}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-[#001a35] text-white py-3 rounded-lg font-semibold disabled:opacity-50"
                            >
                                {isLoading ? 'Creating account…' : 'Create account & continue'}
                            </button>

                            <p className="text-xs text-gray-500 text-center">
                                Selling, or registering a company? <a href="/register" className="underline text-[#A17B35]">Use the full sign-up form</a>
                            </p>
                        </form>
                    )}
                </div>
            </div>
            {/* Rendered inside this popup's layer so it shows on top of it */}
            <ForgotPasswordModal isOpen={showForgotPassword} onClose={() => setShowForgotPassword(false)} />
        </div>
    );
};

// Helpers
const Field = ({ label, icon, children }) => (
    <div>
        <label className="text-xs font-medium">{label}</label>
        <div className="relative">
            {icon && <span className="absolute left-3 top-3 text-gray-400">{icon}</span>}
            {children}
        </div>
    </div>
);

const Input = ({ label, error, icon, ...props }) => (
    <div>
        <label className="text-xs font-medium">{label}</label>
        <div className="relative">
            {icon && <span className="absolute left-3 top-2.5 text-gray-400">{icon}</span>}
            <input {...props} className={`w-full ${icon ? 'pl-10' : 'pl-3'} pr-3 py-2 border rounded-lg text-sm`} />
        </div>
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
);

export default AuthBidModal;