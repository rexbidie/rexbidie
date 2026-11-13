import { useRef, useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Building, User, Fingerprint, ScanFace } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { darkLogo } from '../assets';
import { ForgotPasswordModal } from '../components';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import axios from 'axios';
import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    biometricInfo,
    declineBiometric,
    enableBiometric,
    getBiometricCredentials,
    savedBiometricEmail,
    shouldOfferBiometric,
} from '../native/biometric';
import * as haptics from '../native/haptics';
import { isNativeApp } from '../native/platform';

const Login = () => {
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showForgotPasswordModel, setShowForgotPasswordModal] = useState(false);
    const navigate = useNavigate();
    const { login, user } = useAuth();
    // App only: Face ID / fingerprint sign-in.
    const [bio, setBio] = useState({ available: false, label: '' });
    const [bioEmail, setBioEmail] = useState(null);
    const [offer, setOffer] = useState(null); // { email, password, userType } while asking
    const holdRedirect = useRef(false);

    useEffect(() => {
        biometricInfo().then(setBio);
        setBioEmail(savedBiometricEmail());
    }, []);

    useEffect(() => {
        if (user && user?.userType && !holdRedirect.current) {
            navigate(`/${user.userType}/dashboard`);
        }
    }, [user])

    const finishOffer = async (accept) => {
        const current = offer;
        setOffer(null);
        holdRedirect.current = false;
        if (!current) return;
        if (accept) {
            try {
                await enableBiometric(current.email, current.password);
                toast.success(`${bio.label} sign-in is on`);
            } catch {
                toast.error(`Could not turn on ${bio.label}`);
            }
        } else {
            declineBiometric(current.email);
        }
        navigate(`/${current.userType}/dashboard`);
    };

    const biometricLogin = async () => {
        let creds;
        try {
            creds = await getBiometricCredentials();
        } catch {
            setBioEmail(savedBiometricEmail());
            return; // cancelled, or the saved sign-in was cleared
        }
        setIsLoading(true);
        try {
            const data = await login({ email: creds.email, password: creds.password, rememberMe: true });
            if (data?.success) {
                haptics.bidPlaced();
                toast.success(data.message);
                navigate(`/${data.userType}/dashboard`);
            } else {
                // e.g. the password was changed on the website. Signing in with
                // the password once updates what is saved on this phone.
                toast.error('Please sign in with your password this time');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const { register, handleSubmit } = useForm({
        defaultValues: {
            email: '',
            password: '',
            rememberMe: false,
        }
    });

    const loginHandler = async (loginData) => {
        try {
            setIsLoading(true);

            // Convert email to lowercase before sending to API
            const normalizedLoginData = {
                ...loginData,
                email: loginData.email.toLowerCase().trim(),
                // Always kept signed in inside the app.
                rememberMe: isNativeApp ? true : !!loginData.rememberMe,
            };

            const offerBio = bio.available && shouldOfferBiometric(normalizedLoginData.email);
            if (offerBio) holdRedirect.current = true;
            const data = await login(normalizedLoginData);

            if (data && data.success) {
                toast.success(data.message);

                if (offerBio) {
                    setOffer({ email: normalizedLoginData.email, password: loginData.password, userType: data.userType });
                    return;
                }
                // Keep the saved Face ID / fingerprint sign-in up to date if the password changed.
                if (bioEmail && bioEmail === normalizedLoginData.email) {
                    enableBiometric(normalizedLoginData.email, loginData.password).catch(() => {});
                }

                gtag('event', 'login', {
                    method: 'email',
                    user_type: data.userType
                });

                navigate(`/${data.userType}/dashboard`);
            }
            holdRedirect.current = false;
        } catch (error) {
            holdRedirect.current = false;
            toast.error(error?.response?.data?.message);
            console.log(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen pt-32 pb-16 bg-orange-50 flex items-center justify-center p-4">
            <ForgotPasswordModal isOpen={showForgotPasswordModel} onClose={() => setShowForgotPasswordModal(false)} />
            {offer && (
                <div className="fixed inset-0 z-[200] bg-black/50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
                    <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center">
                        {bio.label === 'Face ID' ? <ScanFace className="mx-auto text-primary" size={44} /> : <Fingerprint className="mx-auto text-primary" size={44} />}
                        <h2 className="text-lg font-bold text-secondary mt-3">Sign in faster next time?</h2>
                        <p className="text-gray-600 text-sm mt-2">
                            Use {bio.label} instead of typing your password. Your password stays locked on this phone and is never shared.
                        </p>
                        <button type="button" onClick={() => finishOffer(true)} className="mt-5 w-full py-3 rounded-lg bg-primary text-white font-semibold">
                            Use {bio.label}
                        </button>
                        <button type="button" onClick={() => finishOffer(false)} className="mt-2 w-full py-3 rounded-lg text-secondary font-medium">
                            Not now
                        </button>
                    </div>
                </div>
            )}
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="pt-8 text-center flex flex-col items-center justify-center gap-3">
                    <img src={darkLogo} alt="logo" className='h-12' />
                    <p className="text-black text-lg">Let's sign you in</p>
                </div>

                {/* Login Form */}
                <div className="p-5 sm:p-8">
                    {bio.available && bioEmail && (
                        <div className="mb-6">
                            <button
                                type="button"
                                onClick={biometricLogin}
                                disabled={isLoading}
                                className="w-full flex items-center justify-center gap-2 bg-secondary text-white py-3 px-4 rounded-lg font-semibold disabled:opacity-50"
                            >
                                {bio.label === 'Face ID' ? <ScanFace size={22} /> : <Fingerprint size={22} />}
                                Sign in with {bio.label}
                            </button>
                            <p className="text-center text-xs text-gray-500 mt-2">{bioEmail}</p>
                            <div className="flex items-center gap-3 mt-5 text-xs text-gray-400">
                                <span className="flex-1 border-t" /> or use your password <span className="flex-1 border-t" />
                            </div>
                        </div>
                    )}
                    <form onSubmit={handleSubmit(loginHandler)} className="space-y-6">
                        {/* Email Field */}
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-secondary mb-2">
                                Email
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <User size={20} className="text-gray-400" />
                                </div>
                                <input
                                    type="email"
                                    id="email"
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg"
                                    placeholder="Enter your email"
                                    required
                                    {...register('email', { required: true })}
                                />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-secondary mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock size={20} className="text-gray-400" />
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="password"
                                    className="block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg "
                                    placeholder="Enter your password"
                                    required
                                    {...register('password', { required: true })}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                >
                                    {showPassword ? (
                                        <EyeOff size={20} className="text-gray-400 hover:text-secondary" />
                                    ) : (
                                        <Eye size={20} className="text-gray-400 hover:text-secondary" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Keep me signed in (website only: the app always stays signed in) / Forgot Password */}
                        <div className="flex justify-between items-center gap-3">
                            {!isNativeApp && (
                                <label className="inline-flex items-center gap-2 text-sm text-secondary cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 accent-[#D19F3E]"
                                        {...register('rememberMe')}
                                    />
                                    Keep me signed in
                                </label>
                            )}
                            <button
                                type='button'
                                onClick={() => setShowForgotPasswordModal(true)}
                                className="text-primary hover:text-primary-dark text-sm font-medium underline"
                            >
                                Forgot password?
                            </button>
                        </div>

                        {/* Sign In Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-[#D19F3E] to-[#E8B86B] hover:from-[#D19F3E]/90 hover:to-[#E8B86B]/90 text-white py-3 px-4 rounded-lg font-semibold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? 'Signing in...' : 'Sign In'}
                        </button>

                        {/* Sign In Button */}
                        <button
                            type="button"
                            onClick={() => navigate('/register')}
                            className="w-full bg-gradient-to-r from-[#001a35] to-[#001a35] hover:from-[#001a35]/90 hover:to-[#001a35]/90 text-white py-3 px-4 rounded-lg font-semibold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Register Now
                        </button>
                    </form>

                    <div className="w-full border-t border-gray-300 mt-6" />

                    {/* Divider */}
                    {/* <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300" />
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white text-secondary">New to RexBid?</span>
                        </div>
                    </div>

                    <div className="text-center">
                        <p className="text-secondary text-sm">
                            Don't have an account?{' '}
                            <Link to={`/register`} className="text-primary hover:text-primary-dark font-semibold underline">
                                Register Now
                            </Link>
                        </p>
                    </div> */}
                </div>

                {/* Footer */}
                <div className="bg-white px-4 pb-4 text-center">
                    <p className="text-xs text-secondary">
                        © {new Date().getFullYear()} RexBid. All rights reserved.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;