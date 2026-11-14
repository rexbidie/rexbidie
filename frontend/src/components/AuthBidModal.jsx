import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
    Mail, Lock, Eye, EyeOff, User, Phone, ChevronDown,
    Gavel, Store, Building2, FileText, X, Banknote
} from 'lucide-react';
import { darkLogo, otherData } from '../assets';
import { toast } from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { useAuth } from '../contexts/AuthContext';
import useCountryStates from '../hooks/useCountryStates';
import { getGaClientId, trackEvent } from '../utils/ga.js';
import { trackMetaRegistration } from '../utils/metaPixel.js';
import { isNativeApp } from '../native/platform';

const AuthBidModal = ({ isOpen, onClose, onAuthSuccess, pendingAction }) => {
    const [activeTab, setActiveTab] = useState('login');
    const { setUser } = useAuth();
    const { useCountries } = useCountryStates();
    const [countries, setCountries] = useState([]);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [userType, setUserType] = useState('bidder');
    const [selectedCountry, setSelectedCountry] = useState('');
    const [counties] = useState([
        "Antrim", "Armagh", "Carlow", "Cavan", "Clare", "Cork", "Derry", "Donegal", "Down",
        "Dublin", "Fermanagh", "Galway", "Kerry", "Kildare", "Kilkenny", "Laois", "Leitrim",
        "Limerick", "Longford", "Louth", "Mayo", "Meath", "Monaghan", "Offaly", "Roscommon",
        "Sligo", "Tipperary", "Tyrone", "Waterford", "Westmeath", "Wexford", "Wicklow"
    ]);
    const [selectedCurrency, setSelectedCurrency] = useState('EUR');
    const currencies = [
        { code: 'GBP', name: 'Pound Sterling' },
        { code: 'EUR', name: 'Euro' },
    ];

    useEffect(() => {
        useCountries().then(setCountries).catch(() => { });
    }, []);

    // Funnel tracking: the login/register wall shown when a guest tries to bid/offer
    const gateAction = pendingAction?.type || 'bid';
    useEffect(() => {
        if (isOpen) {
            trackEvent('bid_auth_gate_view', { action: gateAction, auth_tab: activeTab });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const handleClose = () => {
        trackEvent('bid_auth_gate_abandon', { action: gateAction, auth_tab: activeTab });
        onClose();
    };

    // ---------- LOGIN ----------
    const {
        register: loginRegister,
        handleSubmit: handleLoginSubmit,
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

            // Account doesn't exist → switch to Register tab, prefill email
            if (/no user found|user.*not.*found|not.*exist/i.test(msg)) {
                trackEvent('bid_auth_gate_error', { action: gateAction, auth_method: 'login', reason: 'no_account' });
                toast.error('No user found. Please register.');
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
        watch: regWatch,
        setValue: regSetValue,
        formState: { errors: regErrors },
    } = useForm({
        defaultValues: {
            email: '', phone: '', password: '', confirmPassword: '',
            username: '', firstName: '', lastName: '',
            line1: '', line2: '', county: '', postCode: '',
            country: '', currency: 'EUR', userType: 'bidder',
            companyName: '', companyVATNumber: '', termsConditions: false,
        },
    });

    const password = regWatch('password');

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
            formData.append('countryCode', data.country);
            formData.append('countryName', countries.find(c => c.code === data.country)?.name || data.country);
            formData.append('currency', data.currency || 'EUR');
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
            if (/already exists/i.test(msg)) {
                trackEvent('bid_auth_gate_error', { action: gateAction, auth_method: 'register', reason: 'already_exists' });
                toast.error(msg);
                regSetValue('email', '');
                setActiveTab('login');   // ← suggest login
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
                    {['login', 'register'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 -mb-px ${activeTab === tab
                                ? 'border-[#D19F3E] text-[#D19F3E]'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto">
                    {activeTab === 'login' && (
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

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-gradient-to-r from-[#D19F3E] to-[#E8B86B] text-white py-3 rounded-lg font-semibold disabled:opacity-50"
                            >
                                {isLoading ? 'Signing in…' : 'Sign In'}
                            </button>
                        </form>
                    )}

                    {activeTab === 'register' && (
                        <form onSubmit={handleRegSubmit(onRegister)} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Input label="Email *" placeholder="Enter your email" icon={<Mail size={18} />} error={regErrors.email?.message}
                                    {...regRegister('email', { required: 'Email required' })} />
                                <Input label="Phone *" placeholder={`e.g., ${otherData?.phoneCode}1234XXXX`} icon={<Phone size={18} />} error={regErrors.phone?.message}
                                    {...regRegister('phone', { required: 'Phone required' })} />
                                <div>
                                    <label className="text-xs font-medium">Password *</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            {...regRegister('password', { required: 'Password required', minLength: { value: 6, message: 'Min 6 chars' } })}
                                            className="w-full pl-3 pr-10 py-2 border rounded-lg text-sm"
                                            placeholder="Enter your password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((v) => !v)}
                                            className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                    {regErrors.password && <p className="text-red-500 text-xs mt-1">{regErrors.password.message}</p>}
                                </div>
                                <div>
                                    <label className="text-xs font-medium">Confirm Password *</label>
                                    <div className="relative">
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            {...regRegister('confirmPassword', { validate: (v) => v === password || 'Passwords do not match' })}
                                            className="w-full pl-3 pr-10 py-2 border rounded-lg text-sm"
                                            placeholder="Confirm your password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword((v) => !v)}
                                            className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                                        >
                                            {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                    {regErrors.confirmPassword && <p className="text-red-500 text-xs mt-1">{regErrors.confirmPassword.message}</p>}
                                </div>
                            </div>

                            {/* User type */}
                            <div>
                                <p className="text-sm font-medium mb-2">I am a…</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { key: 'bidder', label: 'Bidder', icon: Gavel },
                                        { key: 'seller', label: 'Seller', icon: Store },
                                        { key: 'company', label: 'Company', icon: Building2 },
                                    ].map(({ key, label, icon: Icon }) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => { setUserType(key); regSetValue('userType', key); }}
                                            className={`flex flex-col items-center gap-1 p-3 border rounded-lg text-xs ${userType === key ? 'border-[#D19F3E] bg-orange-50' : 'border-gray-200'
                                                }`}
                                        >
                                            <Icon size={20} />
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {userType === 'company' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <Input label="Company Name *" placeholder="Enter company name" icon={<Building2 size={18} />} error={regErrors.companyName?.message}
                                        {...regRegister('companyName', { required: userType === 'company' })} />
                                    <Input label="VAT Number" placeholder="Enter VAT number (optional)" icon={<FileText size={18} />} {...regRegister('companyVATNumber')} />
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Input label="First Name *" placeholder={userType === 'company' ? "Contact's first name" : "First name"} error={regErrors.firstName?.message}
                                    {...regRegister('firstName', { required: 'Required' })} />
                                <Input label="Last Name *" placeholder={userType === 'company' ? "Contact's last name" : "Last name"} error={regErrors.lastName?.message}
                                    {...regRegister('lastName', { required: 'Required' })} />
                                <div className="md:col-span-2">
                                    <Input label="Username *" placeholder="Choose a username" icon={<User size={18} />} error={regErrors.username?.message}
                                        {...regRegister('username', { required: 'Required' })} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="text-xs font-medium">Country *</label>
                                    <div className="relative">
                                        <select
                                            {...regRegister('country', { required: 'Required' })}
                                            value={selectedCountry}
                                            onChange={(e) => {
                                                setSelectedCountry(e.target.value);
                                                regSetValue('country', e.target.value);
                                            }}
                                            className="w-full p-2 border rounded-lg text-sm appearance-none"
                                        >
                                            <option value="">Select country</option>
                                            {countries.map((c) => (
                                                <option key={c.code} value={c.code}>{c.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={16} className="absolute right-2 top-3 text-gray-400 pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium">County *</label>
                                    <div className="relative">
                                        <select
                                            {...regRegister('county', {
                                                required: selectedCountry ? 'County is required' : false,
                                            })}
                                            className="w-full p-2 border rounded-lg text-sm appearance-none"
                                            disabled={!selectedCountry}
                                        >
                                            <option value="">Select county</option>
                                            {counties.map((county) => (
                                                <option key={county} value={county}>
                                                    {county}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown
                                            size={16}
                                            className="absolute right-2 top-3 text-gray-400 pointer-events-none"
                                        />
                                    </div>
                                </div>
                                <Input label="Post Code *" placeholder="Postal code" {...regRegister('postCode', { required: 'Required' })} />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
                                <Input label="Address Line 1" placeholder="Address Line 1" {...regRegister('line1')} />
                                <Input label="Address Line 2" placeholder="Address Line 2" {...regRegister('line2')} />
                            </div>

                            <div>
                                <label className="text-xs font-medium flex items-center gap-1">
                                    <Banknote size={14} /> Currency *
                                </label>
                                <div className="relative">
                                    <select
                                        {...regRegister('currency', { required: 'Currency is required' })}
                                        value={selectedCurrency}
                                        onChange={(e) => {
                                            setSelectedCurrency(e.target.value);
                                            regSetValue('currency', e.target.value);
                                        }}
                                        className="w-full p-2 border rounded-lg text-sm appearance-none"
                                    >
                                        <option value="">Select currency</option>
                                        {currencies.map((c) => (
                                            <option key={c.code} value={c.code}>{c.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} className="absolute right-2 top-3 text-gray-400 pointer-events-none" />
                                </div>
                                {regErrors.currency && <p className="text-red-500 text-xs mt-1">{regErrors.currency.message}</p>}
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
                                {isLoading ? 'Creating account…' : 'Create Account & Continue'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
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