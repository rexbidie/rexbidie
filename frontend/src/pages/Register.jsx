import { useEffect, useState } from 'react';
import { isNativeApp } from '../native/platform';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, User, Phone, ChevronDown, Gavel, Store, Handshake, Banknote, Building2, FileText, Upload, X, AlertCircle } from 'lucide-react';
import { darkLogo, otherData } from '../assets';
import axios from "axios";
import { toast } from "react-hot-toast";
import { useAuth } from '../contexts/AuthContext';
import { loadStripe } from '@stripe/stripe-js';
import { useStripe, useElements, CardElement, Elements } from '@stripe/react-stripe-js';
import axiosInstance from '../utils/axiosInstance';
import useCountryStates from '../hooks/useCountryStates';
import PilotPhaseModal from '../components/PilotPhaseModal';
import { useRef } from 'react';
import { getGaClientId } from '../utils/ga.js';
import { trackMetaRegistration } from '../utils/metaPixel.js';

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// CardSection component
const CardSection = () => {
    const stripe = useStripe();
    const elements = useElements();

    return (
        <div className="space-y-4 border-t border-gray-200 dark:border-bg-primary-light pt-6 mt-6">
            <h3 className="text-lg font-semibold text-text-primary dark:text-text-primary-dark">Payment Information <span className='text-red-600'>*</span></h3>
            <p className="text-sm text-text-secondary dark:text-text-secondary-dark">
                RexBid requires a credit card. There is no charge to register.
                We will only authorize that your card is valid.
            </p>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-text-secondary dark:text-text-secondary-dark mb-2">
                        Credit Card Information
                    </label>
                    <div className="p-4 border border-gray-300 dark:border-bg-primary-light rounded-lg bg-gray-50 dark:bg-bg-primary-light">
                        <CardElement
                            options={{
                                style: {
                                    base: {
                                        fontSize: '16px',
                                        color: '#008000',
                                        fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
                                        '::placeholder': {
                                            color: '#aab7c4',
                                        },
                                    },
                                    invalid: {
                                        color: '#fa755a',
                                        iconColor: '#fa755a',
                                    },
                                },
                                hidePostalCode: true
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

// Main Register component
const Register = () => {
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [userType, setUserType] = useState('bidder');
    const navigate = useNavigate();
    const { setUser, setLoading, user } = useAuth();
    const { useCountries, useStatesByCountry } = useCountryStates();
    const [countries, setCountries] = useState([]);
    const [currencies, setCurrencies] = useState([{ code: 'GBP', name: 'Pound Sterling' }, { code: 'EUR', name: 'Euro' }]);
    const [states, setStates] = useState([]);
    const [counties, setCounties] = useState([
        "Antrim", "Armagh", "Carlow", "Cavan", "Clare", "Cork", "Derry", "Donegal", "Down",
        "Dublin", "Fermanagh", "Galway", "Kerry", "Kildare", "Kilkenny",
        "Laois", "Leitrim", "Limerick", "Longford", "Louth", "Mayo", "Meath",
        "Monaghan", "Offaly", "Roscommon", "Sligo", "Tipperary", "Tyrone",
        "Waterford", "Westmeath", "Wexford", "Wicklow"
    ]);
    const [selectedCountry, setSelectedCountry] = useState('');
    const [selectedCurrency, setSelectedCurrency] = useState('EUR');

    const [identificationDocument, setIdentificationDocument] = useState(null);
    const [identificationDocumentPreview, setIdentificationDocumentPreview] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [idVerificationError, setIdVerificationError] = useState('');
    const [isCompleting, setIsCompleting] = useState(false);

    // Pilot phase
    const [isPilotModalOpen, setIsPilotModalOpen] = useState(false);

    useEffect(() => {
        const fetchCountries = async () => {
            setCountries(await useCountries());
        };
        fetchCountries();

        // setIsPilotModalOpen(true);
    }, []);

    const handlePilotModalClose = () => {
        setIsPilotModalOpen(false);
        navigate('/');
    };

    useEffect(() => {
        if (user && user?.userType) {
            navigate(`/${user.userType}/profile`);
        }
    }, [user, navigate]);

    const stripe = useStripe();
    const elements = useElements();

    const { register, handleSubmit, watch, formState: { errors }, setValue } = useForm({
        defaultValues: {
            email: '',
            phone: '',
            password: '',
            confirmPassword: '',
            username: '',
            firstName: '',
            lastName: '',
            line1: '',
            line2: '',
            county: '',
            postCode: '',
            country: '',
            currency: '',
            userType: 'bidder',
            companyName: '',
            companyVATNumber: '',
            termsConditions: false
        }
    });

    const password = watch('password');

    const handleUserTypeChange = (type) => {
        setUserType(type);
        setValue('userType', type);
    };

    const handleCountryChange = async (e) => {
        const countryCode = e.target.value;
        setSelectedCountry(countryCode);
        setValue('country', countryCode);
        setValue('state', '');
        setStates([]);

        if (countryCode) {
            try {
                const statesList = await useStatesByCountry(countryCode);
                setStates(statesList);
            } catch (error) {
                console.error('Error fetching states:', error);
                toast.error('Failed to load states');
            }
        }
    };

    const handleCurrencyChange = async (e) => {
        const currencyCode = e.target.value;
        setSelectedCurrency(currencyCode);
        setValue('currency', currencyCode);
    };

    const handleIdentificationDocumentChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                toast.error('File size should be less than 5MB');
                return;
            }

            const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
            if (!allowedTypes.includes(file.type)) {
                toast.error('Please upload JPG, PNG, or PDF files only');
                return;
            }

            setIdentificationDocument(file);

            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setIdentificationDocumentPreview(reader.result);
                };
                reader.readAsDataURL(file);
            } else {
                setIdentificationDocumentPreview(null);
            }
        }
    };

    const removeIdentificationDocument = () => {
        setIdentificationDocument(null);
        setIdentificationDocumentPreview(null);
        document.getElementById('identificationDocument').value = '';
    };

    const hasCompleted = useRef(false);

    useEffect(() => {
        const complete = async () => {
            // Prevent duplicate execution
            if (hasCompleted.current) return;

            const params = new URLSearchParams(location.search);
            const setupIntentId = params.get('setup_intent');
            const token = sessionStorage.getItem('registrationToken');

            if (!setupIntentId || !token) return;

            hasCompleted.current = true;

            try {
                // Complete registration
                await completeRegistration(token, setupIntentId);

                // Only remove after successful completion
                sessionStorage.removeItem('registrationToken');

                // Clear URL parameters after registration completes
                window.history.replaceState(
                    {},
                    document.title,
                    window.location.pathname
                );
            } catch (error) {
                console.error('Completion failed:', error);
                // Reset flag so user can retry
                hasCompleted.current = false;
            }
        };

        complete();
    }, [location.search]);

    const completeRegistration = async (token, setupIntentId) => {
        setIsCompleting(true); // Show loading overlay
        // const loadingToastId = toast.loading('Verifying your payment and creating account...');

        try {
            setIsLoading(true);
            const { data } = await axios.post(
                `${import.meta.env.VITE_DOMAIN_URL}/api/v1/users/register`,
                { registrationToken: token, setupIntentId, gaClientId: getGaClientId() },
                { withCredentials: true }
            );

            // toast.dismiss(loadingToastId);

            if (data.success) {
                localStorage.setItem('accessToken', data.data.accessToken);
                localStorage.setItem('refreshToken', data.data.refreshToken);
                localStorage.setItem('user', JSON.stringify(data.data.user));

                const redirectPath = data.data.user.userType === 'seller'
                    ? '/seller/dashboard'
                    : data.data.user.userType === 'company'
                        ? '/company/dashboard'
                        : '/bidder/dashboard';

                setUser(data.data.user);
                toast.success('Account created successfully! 🎉');
                navigate(redirectPath);
            } else {
                toast.error(data.message || 'Registration failed');
            }
        } catch (error) {
            // (loading toast is no longer shown)
            toast.error(error?.response?.data?.message || 'Completion failed');
        } finally {
            setIsLoading(false);
            setIsCompleting(false);
            hasCompleted.current = false;
        }
    };

    const onSubmit = async (registrationData) => {
        // Validate ID document
        // if (!identificationDocument) {
        //     setIdVerificationError('Please upload an identification document');
        //     toast.error('Identification document is required');
        //     return;
        // }

        setIsLoading(true);

        try {
            // Step 1: Initiate registration
            const formData = new FormData();
            // Append all fields (same as before)
            formData.append('firstName', registrationData.firstName);
            formData.append('lastName', registrationData.lastName);
            formData.append('email', registrationData.email);
            formData.append('phone', registrationData.phone);
            formData.append('password', registrationData.password);
            formData.append('username', registrationData.username);
            formData.append('countryCode', registrationData.country);
            formData.append('countryName', countries.find(c => c.code === registrationData.country)?.name || registrationData.country);
            formData.append('userType', registrationData.userType);
            formData.append('line1', registrationData.line1);
            formData.append('line2', registrationData.line2);
            formData.append('county', registrationData.county);
            formData.append('postCode', registrationData.postCode);
            formData.append('state', registrationData.state);
            formData.append('country', countries.find(c => c.code === registrationData.country)?.name || registrationData.country);
            formData.append('currency', registrationData.currency || 'EUR');

            if (registrationData.userType === 'company') {
                formData.append('companyName', registrationData.companyName);
                formData.append('companyVATNumber', registrationData.companyVATNumber || '');
            }

            if (identificationDocument) {
                formData.append('identificationDocument', identificationDocument);
            }

            formData.append('gaClientId', getGaClientId() || '');

            // Get payment method from Stripe Elements
            // if (!stripe || !elements) {
            //     toast.error('Stripe not initialized');
            //     setIsLoading(false);
            //     return;
            // }
            // const cardElement = elements.getElement(CardElement);
            // if (!cardElement) {
            //     toast.error('Please enter your card details');
            //     setIsLoading(false);
            //     return;
            // }

            // const { error, paymentMethod } = await stripe.createPaymentMethod({
            //     type: 'card',
            //     card: cardElement,
            //     billing_details: {
            //         name: `${registrationData.firstName} ${registrationData.lastName}`,
            //         email: registrationData.email,
            //         phone: registrationData.phone,
            //         address: { country: registrationData.country },
            //     },
            // });

            // if (error) {
            //     toast.error(`Payment error: ${error.message}`);
            //     setIsLoading(false);
            //     return;
            // }
            // formData.append('paymentMethodId', paymentMethod.id);

            // Step 1: Send user data (FormData) to the server
            const response = await axiosInstance.post(
                `${import.meta.env.VITE_DOMAIN_URL}/api/v1/users/register`,
                formData,                                   // the FormData you built earlier
                {
                    withCredentials: true,
                    headers: { 'Content-Type': 'multipart/form-data' },
                }
            );

            const data = response.data; // only one declaration of data

            // If 3D Secure is required, the server returns clientSecret + token
            if (data.requiresAction) {
                sessionStorage.setItem('registrationToken', data.registrationToken);
                const returnUrl = window.location.origin + window.location.pathname;

                try {
                    // Use confirmSetup (newer API) instead of confirmSetupIntent
                    const result = await stripe.confirmSetup({
                        clientSecret: data.clientSecret,
                        confirmParams: {
                            return_url: returnUrl,
                        },
                        // App: show the bank's check in a pop-up instead of leaving the app.
                        ...(isNativeApp ? { redirect: 'if_required' } : {}),
                    });

                    if (result.error) {
                        toast.error(result.error.message);
                        setIsLoading(false);
                        return;
                    }

                    if (isNativeApp && result.setupIntent?.status === 'succeeded') {
                        await completeRegistration(data.registrationToken, result.setupIntent.id);
                        sessionStorage.removeItem('registrationToken');
                        return;
                    }

                    // If there's a redirect URL, use it
                    if (result.setupIntent?.next_action?.redirect_to_url?.url) {
                        window.location.href = result.setupIntent.next_action.redirect_to_url.url;
                    }

                    // CRITICAL: Return here to prevent execution of the non-3DS code path
                    setIsLoading(false);
                    return; // <-- THIS IS THE KEY FIX

                } catch (err) {
                    toast.error('3D Secure authentication failed');
                    setIsLoading(false);
                    return;
                }
            }

            // No 3DS required – registration completed immediately
            // This code will ONLY run when data.requiresAction is false
            const accessToken = data.data.accessToken;
            const refreshToken = data.data.refreshToken;
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            localStorage.setItem('user', JSON.stringify(data.data.user));
            setUser(data.data.user);

            const redirectPath = data.data.user.userType === 'seller'
                ? '/seller/dashboard'
                : data.data.user.userType === 'company'
                    ? '/company/dashboard'
                    : '/bidder/dashboard';

            // Track successful registration in Meta (Pixel + Conversions API)
            trackMetaRegistration(data.data.user.userType, data.data.user.currency);

            gtag('event', 'sign_up', {
                user_type: data.data.user.userType,
                method: 'email'
            });

            navigate(redirectPath);
            toast.success(data.message);

        } catch (error) {
            // This catch block will now only handle non-3DS errors
            toast.error(error?.response?.data?.message || 'Registration failed');
            console.error('Registration error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {isCompleting && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-8 max-w-md w-full text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                        <h3 className="text-lg font-semibold mb-2">Setting up your account</h3>
                        <p className="text-gray-600">Please wait while we complete your registration...</p>
                    </div>
                </div>
            )}

            <div className="min-h-screen pt-32 pb-16 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden">
                    {/* Header */}
                    <div className="pt-8 text-center flex flex-col items-center justify-center gap-3">
                        <img src={darkLogo} alt="logo" className='h-12' />
                        <p className="text-black text-lg">Create your account</p>
                    </div>

                    <PilotPhaseModal
                        isOpen={isPilotModalOpen}
                        onClose={handlePilotModalClose}
                    />

                    {/* Registration Form */}
                    <div className="p-5 sm:p-8">
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                            {/* Account Information */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800">Account Information</h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className={`${errors.email && 'mb-3'}`}>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Email *
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <Mail size={20} className="text-gray-400" />
                                            </div>
                                            <input
                                                type="email"
                                                {...register('email', {
                                                    required: 'Email is required',
                                                    pattern: {
                                                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                                                        message: 'Invalid email address'
                                                    }
                                                })}
                                                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                                placeholder="Enter your email"
                                            />
                                            {errors.email && (
                                                <p className="text-red-500 text-sm mt-1 absolute">{errors.email.message}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className={`${errors.phone && 'mb-3'}`}>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Phone *
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <Phone size={20} className="text-gray-400" />
                                            </div>
                                            <input
                                                type="tel"
                                                {...register('phone', {
                                                    required: 'Phone is required',
                                                    pattern: {
                                                        value: /^[\d+\s()-]{10,15}$/,
                                                        message: 'Please enter a valid phone number'
                                                    }
                                                })}
                                                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                                placeholder={`e.g., ${otherData?.phoneCode}1234XXXX`}
                                            />
                                            {errors.phone && (
                                                <p className="text-red-500 text-sm mt-1 absolute">{errors.phone.message}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className={`${errors.password && 'mb-3'}`}>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Password *
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <Lock size={20} className="text-gray-400" />
                                            </div>
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                {...register('password', {
                                                    required: 'Password is required',
                                                    minLength: { value: 6, message: 'Password must be at least 6 characters' }
                                                })}
                                                className="block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                                placeholder="Enter your password"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                            >
                                                {showPassword ? (
                                                    <EyeOff size={20} className="text-gray-400 hover:text-gray-600" />
                                                ) : (
                                                    <Eye size={20} className="text-gray-400 hover:text-gray-600" />
                                                )}
                                            </button>
                                            {errors.password && (
                                                <p className="text-red-500 text-sm mt-1 absolute">{errors.password.message}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className={`${errors.confirmPassword && 'mb-3'}`}>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Confirm Password *
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <Lock size={20} className="text-gray-400" />
                                            </div>
                                            <input
                                                type={showConfirmPassword ? 'text' : 'password'}
                                                {...register('confirmPassword', {
                                                    required: 'Please confirm your password',
                                                    validate: value => value === password || 'Passwords do not match'
                                                })}
                                                className="block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                                placeholder="Confirm your password"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                            >
                                                {showConfirmPassword ? (
                                                    <EyeOff size={20} className="text-gray-400 hover:text-gray-600" />
                                                ) : (
                                                    <Eye size={20} className="text-gray-400 hover:text-gray-600" />
                                                )}
                                            </button>
                                            {errors.confirmPassword && (
                                                <p className="text-red-500 text-sm mt-1 absolute">{errors.confirmPassword.message}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* User Type Selection - Moved to top */}
                            <div className={`border-t pt-6 ${errors.email && 'mb-3'}`}>
                                <label className="text-sm font-medium leading-none text-gray-700 flex items-center gap-2 mb-4">
                                    <User size={20} />
                                    <span>User Type</span>
                                </label>

                                <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-stretch gap-3 my-2">
                                    <label
                                        className={`flex items-center gap-5 border py-3 px-5 rounded cursor-pointer transition-colors ${userType === 'bidder' ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            value="bidder"
                                            {...register('userType', { required: 'Please select user type' })}
                                            className="hidden"
                                            onChange={() => handleUserTypeChange('bidder')}
                                        />
                                        <Gavel size={40} className={`flex-shrink-0 p-2 rounded ${userType === 'bidder' ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'
                                            }`} />
                                        <div>
                                            <p className="text-sm font-semibold">I'm a bidder</p>
                                            <p className="text-sm text-gray-600">I want to bid on the listings on the platform.</p>
                                        </div>
                                    </label>

                                    <label
                                        className={`flex items-center gap-5 border py-3 px-5 rounded cursor-pointer transition-colors ${userType === 'seller' ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            value="seller"
                                            {...register('userType', { required: 'Please select user type' })}
                                            className="hidden"
                                            onChange={() => handleUserTypeChange('seller')}
                                        />
                                        <Store size={40} className={`flex-shrink-0 p-2 rounded ${userType === 'seller' ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'
                                            }`} />
                                        <div>
                                            <p className="text-sm font-semibold">I'm a private seller</p>
                                            <p className="text-sm text-gray-600">I want to list things on the platform.</p>
                                        </div>
                                    </label>

                                    {/* New Company Option */}
                                    <label
                                        className={`flex items-center gap-5 border py-3 px-5 rounded cursor-pointer transition-colors ${userType === 'company' ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            value="company"
                                            {...register('userType', { required: 'Please select user type' })}
                                            className="hidden"
                                            onChange={() => handleUserTypeChange('company')}
                                        />
                                        <Building2 size={40} className={`flex-shrink-0 p-2 rounded ${userType === 'company' ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'
                                            }`} />
                                        <div>
                                            <p className="text-sm font-semibold">I'm a company</p>
                                            <p className="text-sm text-gray-600">I want to buy or sell on behalf of my company.</p>
                                        </div>
                                    </label>
                                </div>
                                {errors.userType && (
                                    <p className="text-red-500 text-sm mt-1 absolute">{errors.userType.message}</p>
                                )}
                            </div>

                            {/* Personal Information - Changes based on user type */}
                            <div className="space-y-4 border-t pt-6">
                                <h3 className="text-lg font-semibold text-gray-800">
                                    {userType === 'company' ? 'Company Information' : 'Personal Information'}
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* For company, show Company Name first */}
                                    {userType === 'company' && (
                                        <>
                                            <div className="md:col-span-2">
                                                <div className={`${errors.companyName && 'mb-3'}`}>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        Company Name *
                                                    </label>
                                                    <div className="relative">
                                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                            <Building2 size={20} className="text-gray-400" />
                                                        </div>
                                                        <input
                                                            type="text"
                                                            {...register('companyName', {
                                                                required: userType === 'company' ? 'Company name is required' : false
                                                            })}
                                                            className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                                            placeholder="Enter company name"
                                                        />
                                                        {errors.companyName && (
                                                            <p className="text-red-500 text-sm mt-1 absolute">{errors.companyName.message}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="md:col-span-2">
                                                <div className={`${errors.companyVATNumber && 'mb-3'}`}>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        VAT Number
                                                    </label>
                                                    <div className="relative">
                                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                            <FileText size={20} className="text-gray-400" />
                                                        </div>
                                                        <input
                                                            type="text"
                                                            {...register('companyVATNumber')}
                                                            className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                                            placeholder="Enter VAT number (optional)"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* First Name - Always shown, but label changes for company */}
                                    <div className={`${errors.firstName && 'mb-3'}`}>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            {userType === 'company' ? 'Contact First Name *' : 'First Name *'}
                                        </label>
                                        <input
                                            type="text"
                                            {...register('firstName', {
                                                required: `${userType === 'company' ? 'Contact first' : 'First'} name is required`,
                                                minLength: { value: 2, message: 'Name must be at least 2 characters' }
                                            })}
                                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                            placeholder={userType === 'company' ? "Contact's first name" : "First name"}
                                        />
                                        {errors.firstName && (
                                            <p className="text-red-500 text-sm mt-1 absolute">{errors.firstName.message}</p>
                                        )}
                                    </div>

                                    {/* Last Name - Always shown, but label changes for company */}
                                    <div className={`${errors.lastName && 'mb-3'}`}>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            {userType === 'company' ? 'Contact Last Name *' : 'Last Name *'}
                                        </label>
                                        <input
                                            type="text"
                                            {...register('lastName', {
                                                required: `${userType === 'company' ? 'Contact last' : 'Last'} name is required`,
                                                minLength: { value: 2, message: 'Name must be at least 2 characters' }
                                            })}
                                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                            placeholder={userType === 'company' ? "Contact's last name" : "Last name"}
                                        />
                                        {errors.lastName && (
                                            <p className="text-red-500 text-sm mt-1 absolute">{errors.lastName.message}</p>
                                        )}
                                    </div>

                                    {/* Username - Always shown */}
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-text-secondary dark:text-text-secondary-dark mb-2">
                                            Username <span className='text-red-600'>*</span>
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <User size={20} className="text-bg-primary-light dark:text-bg-secondary-dark" />
                                            </div>
                                            <input
                                                type="text"
                                                {...register('username', {
                                                    required: 'Username is required',
                                                    minLength: { value: 3, message: 'Username must be at least 3 characters' },
                                                    pattern: {
                                                        value: /^[a-zA-Z0-9_]+$/,
                                                        message: 'Username can only contain letters, numbers, and underscores'
                                                    }
                                                })}
                                                className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-bg-primary-light bg-bg-secondary dark:bg-bg-primary text-text-primary dark:text-text-primary-dark rounded-lg focus:ring-2 focus:ring-secondary-darktext-bg-secondary-dark dark:focus:ring-gray-500 focus:border-transparent"
                                                placeholder="Choose a username"
                                            />
                                        </div>
                                        {errors.username && (
                                            <p className="text-red-500 text-sm mt-1">{errors.username.message}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Address Information - Same for all user types */}
                            <div className="space-y-4 border-t pt-6">
                                <h3 className="text-lg font-semibold text-gray-800">Address Information</h3>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Country field */}
                                    <div className="md:col-span-1">
                                        <div className={`${errors.country && 'mb-3'}`}>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Country <span className='text-red-600'>*</span>
                                            </label>
                                            <div className="relative">
                                                <select
                                                    {...register('country', { required: 'Country is required' })}
                                                    onChange={handleCountryChange}
                                                    value={selectedCountry}
                                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent appearance-none"
                                                >
                                                    <option value="">Select country</option>
                                                    {countries.map(country => (
                                                        <option key={country.code} value={country.code}>
                                                            {country.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <ChevronDown size={20} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
                                                {errors.country && (
                                                    <p className="text-red-500 text-sm mt-1 absolute">{errors.country.message}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* State field */}
                                    {/* <div className={`${errors.state && 'mb-3'}`}>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            State/Province <span className='text-red-600'>*</span>
                                        </label>
                                        <div className="relative">
                                            {states.length > 0 ? (

                                                <select
                                                    {...register('state', {
                                                        required: selectedCountry ? 'State is required' : false
                                                    })}
                                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent appearance-none"
                                                    disabled={!selectedCountry}
                                                >
                                                    <option value="">Select state</option>
                                                    {states.map(state => (
                                                        <option key={state.id || state.code} value={state.name}>
                                                            {state.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    type="text"
                                                    {...register('state', {
                                                        required: selectedCountry ? 'State is required' : false
                                                    })}
                                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                                    placeholder={selectedCountry ? "Enter state" : "Select a country first"}
                                                    disabled={!selectedCountry}
                                                />
                                            )}
                                            <ChevronDown size={20} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
                                            {errors.state && (
                                                <p className="text-red-500 text-sm mt-1 absolute">{errors.state.message}</p>
                                            )}
                                        </div>
                                    </div> */}

                                    {/* County field */}
                                    <div className={`${errors.county && 'mb-3'}`}>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            County <span className='text-red-600'>*</span>
                                        </label>
                                        <div className="relative">
                                            <select
                                                {...register('county', {
                                                    required: selectedCountry ? 'County is required' : false
                                                })}
                                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent appearance-none"
                                                disabled={!selectedCountry}
                                            >
                                                <option value="">Select county</option>
                                                {counties.map(county => (
                                                    <option key={county} value={county}>
                                                        {county}
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown size={20} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
                                            {errors.county && (
                                                <p className="text-red-500 text-sm mt-1 absolute">{errors.county.message}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Post Code field */}
                                    <div className={`${errors.postCode && 'mb-3'}`}>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Post/EIR Code <span className='text-red-600'>*</span>
                                        </label>
                                        <input
                                            type="text"
                                            {...register('postCode', {
                                                required: 'Post/EIR code is required'
                                            })}
                                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                            placeholder="Postal code"
                                        />
                                        {errors.postCode && (
                                            <p className="text-red-500 text-sm mt-1 absolute">{errors.postCode.message}</p>
                                        )}
                                    </div>

                                    {/* Address Line 1 field */}
                                    <div className="md:col-span-3">
                                        <div className={`${errors.line1 && 'mb-3'}`}>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Address Line 1
                                                {/* <span className='text-red-600'>*</span> */}
                                            </label>
                                            <input
                                                type="text"
                                                {...register('line1')}
                                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                                placeholder="Address Line 1"
                                            />
                                            {errors.line1 && (
                                                <p className="text-red-500 text-sm mt-1 absolute">{errors.line1.message}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Address Line 2 field */}
                                    <div className="md:col-span-3">
                                        <div className={`${errors.line2 && 'mb-3'}`}>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Address Line 2
                                                {/* <span className='text-red-600'>*</span> */}
                                            </label>
                                            <input
                                                type="text"
                                                {...register('line2')}
                                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                                placeholder="Address Line 2"
                                            />
                                            {errors.line2 && (
                                                <p className="text-red-500 text-sm mt-1 absolute">{errors.line2.message}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Currency Selection */}
                            <div className={`border-t pt-6 pb-3 ${errors.currency && 'mb-3'}`}>
                                <label className="text-sm font-medium leading-none text-gray-700 flex items-center gap-2 mb-4">
                                    <Banknote size={20} />
                                    <span>Currency</span>
                                </label>
                                <div className="relative">
                                    <select
                                        {...register('currency', { required: 'Currency is required' })}
                                        onChange={handleCurrencyChange}
                                        value={selectedCurrency}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent appearance-none"
                                    >
                                        <option value="">Select currency</option>
                                        {currencies.map(currency => (
                                            <option key={currency.code} value={currency.code}>
                                                {currency.name}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown size={20} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
                                </div>
                                <p className="text-gray-500 text-xs py-2 absolute">Note: You can change it later from profile settings.</p>
                                {errors.currency && (
                                    <p className="text-red-500 text-sm mt-1 absolute">{errors.currency.message}</p>
                                )}
                            </div>

                            {/* ID Verification Section */}
                            {/* <div id="id-verification-section" className="border-t border-gray-200 dark:border-bg-primary-light pt-6">
                                <h3 className="text-lg font-semibold text-text-primary dark:text-text-primary-dark mb-4">Identity Verification <span className='text-red-600'>*</span></h3>
                                <p className="text-sm text-text-secondary dark:text-text-secondary-dark mb-4">
                                    Please upload a valid government-issued ID (Driver's License, Passport, or National ID Card)
                                </p>

                                <div className="space-y-4">
                                    <div className="relative">
                                        <input
                                            type="file"
                                            id="identificationDocument"
                                            accept=".jpg,.jpeg,.png,.pdf"
                                            onChange={handleIdentificationDocumentChange}
                                            className="hidden"
                                        />

                                        {!identificationDocument ? (
                                            <label
                                                htmlFor="identificationDocument"
                                                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-bg-primary-light rounded-lg cursor-pointer hover:border-primary dark:hover:border-primary-dark hover:bg-blue-50 dark:hover:bg-bg-primary-light transition-colors"
                                            >
                                                <Upload size={24} className="text-bg-secondary-dark dark:text-gray-600 mb-2" />
                                                <span className="text-sm text-text-secondary dark:text-text-secondary-dark">Click to upload or drag and drop</span>
                                                <span className="text-xs text-gray-500 dark:text-gray-500 mt-1">JPG, PNG, or PDF (Max 5MB)</span>
                                            </label>
                                        ) : (
                                            <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-bg-primary-light rounded-lg bg-gray-50 dark:bg-bg-primary-light">
                                                <div className="flex items-center gap-3">
                                                    {identificationDocument.type.startsWith('image/') && identificationDocumentPreview ? (
                                                        <img
                                                            src={identificationDocumentPreview}
                                                            alt="ID Preview"
                                                            className="w-12 h-12 object-cover rounded"
                                                        />
                                                    ) : (
                                                        <FileText size={24} className="text-primary dark:text-primary-dark" />
                                                    )}
                                                    <div>
                                                        <p className="text-sm font-medium text-text-primary dark:text-text-primary-dark">{identificationDocument.name}</p>
                                                        <p className="text-xs text-text-secondary dark:text-text-secondary-dark">
                                                            {(identificationDocument.size / 1024 / 1024).toFixed(2)} MB
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={removeIdentificationDocument}
                                                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                                                >
                                                    <X size={20} className="text-gray-500 dark:text-bg-secondary-dark" />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {uploadProgress > 0 && uploadProgress < 100 && (
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                            <div
                                                className="bg-primary dark:bg-primary-dark h-2.5 rounded-full transition-all duration-300"
                                                style={{ width: `${uploadProgress}%` }}
                                            ></div>
                                        </div>
                                    )}

                                    <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-bg-primary-light rounded-lg">
                                        <AlertCircle size={20} className="text-blue-600 dark:text-blue-600 flex-shrink-0 mt-0.5" />
                                        <p className="text-xs text-blue-700 dark:text-blue-600">
                                            Your ID will be securely stored and verified. We use this to prevent fraud and ensure platform safety.
                                            {userType === 'seller' && ' Sellers require ID verification to list items.'}
                                        </p>
                                    </div>
                                </div>
                            </div> */}

                            {/* Stripe Card Section for Bidders */}
                            {/* <CardSection /> */}

                            <div className={`${errors.termsConditions && 'mb-3'}`}>
                                <label className='flex items-center gap-2'>
                                    <input
                                        type="checkbox"
                                        {...register('termsConditions', { required: 'Accepting terms of use is required for registration.' })}
                                    />

                                    <p className="text-sm text-gray-600">By registering, I agree to RexBid's <Link className='text-blue-600 underline' to={`/terms-of-use`}>Terms of Use</Link>. My information will be used as described in the <Link to={`/privacy-policy`} className='text-blue-600 underline'>Privacy Policy</Link>.</p>
                                </label>
                                {errors.termsConditions && (
                                    <p className="text-red-500 text-sm mt-1">{errors.termsConditions.message}</p>
                                )}
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-gradient-to-r from-[#D19F3E] to-[#E8B86B] hover:from-[#D19F3E]/90 hover:to-[#E8B86B]/90 text-white py-3 px-4 rounded-lg font-semibold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                            >
                                {isLoading ? 'Creating account...' : 'Create Account'}
                            </button>
                        </form>

                        {/* Already have account */}
                        <div className="text-center mt-6">
                            <p className="text-gray-600 text-sm">
                                Already have an account?{' '}
                                <Link to="/login" className="text-primary hover:text-primary-dark font-semibold underline">
                                    Sign in
                                </Link>
                            </p>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-white px-4 pb-4 text-center">
                        <p className="text-xs text-gray-500">
                            © {new Date().getFullYear()} RexBid. All rights reserved.
                        </p>
                    </div>
                </div >
            </div >
        </>

    );
};

// Wrap the main component with Stripe Elements provider
const RegisterWithStripe = () => (
    <Elements stripe={stripePromise}>
        <Register />
    </Elements>
);

export default RegisterWithStripe;