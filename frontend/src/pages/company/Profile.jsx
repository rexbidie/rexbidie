import { useState, useEffect } from "react";
import { LoadingSpinner, CompanyContainer, CompanyHeader, CompanySidebar } from "../../components";
import {
    User, Mail, Phone, MapPin, Camera, Edit, Save, X, Shield, Lock,
    Upload, Award, Gavel, Heart, Star, TrendingUp, Bell, Newspaper,
    Target,
    DollarSign,
    BarChart3,
    ChevronDown,
    Building,
    FileText,
    CheckCircle,
    Clock,
    AlertCircle,
    Eye,
    Download,
    RefreshCw,
    EuroIcon
} from "lucide-react";
import axiosInstance from "../../utils/axiosInstance";
import { useAuth } from "../../contexts/AuthContext";
import PreferencesPanel from "../../components/PreferencesPanel";
import DeleteAccountPanel from "../../components/DeleteAccountPanel";

// Default preferences
const defaultPreferences = {
    emailUpdates: true,
};

function Profile() {
    const [userData, setUserData] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [activeSection, setActiveSection] = useState("personal");
    const [imagePreview, setImagePreview] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState(null);
    const [currencies, setCurrencies] = useState([{ code: 'GBP', name: 'Pound Sterling' }, { code: 'EUR', name: 'Euro' }]);
    const [selectedCurrency, setSelectedCurrency] = useState('');
    const { user, setUser } = useAuth();
    const userCurrency = user?.currency || 'EUR';

    const [identificationDocument, setIdentificationDocument] = useState(null);
    const [identificationDocumentPreview, setIdentificationDocumentPreview] = useState(null);
    const [uploadingId, setUploadingId] = useState(false);
    const [idUploadProgress, setIdUploadProgress] = useState(0);

    // Fetch user data and stats on component mount
    useEffect(() => {
        fetchUserData();
        fetchUserStats();
    }, []);

    const fetchUserData = async () => {
        try {
            setLoading(true);
            const { data } = await axiosInstance.get(`/api/v1/users/profile?currency=${userCurrency}`);
            if (data.success) {
                setUserData(data.data.user);
                const userInfo = {
                    _id: data.data.user._id,
                    firstName: data.data.user.firstName,
                    lastName: data.data.user.lastName,
                    username: data.data.user.username,
                    userType: data.data.user.userType,
                    email: data.data.user.email,
                    phone: data.data.user.phone,
                    isVerified: data.data.user.isVerified,
                    isActive: data.data.user.isActive,
                    image: data.data.user.image,
                    createdAt: data.data.user.createdAt,
                    countryName: data.data.user.countryName,
                    countryCode: data.data.user.countryCode,
                    currency: data.data.user.currency,
                };
                localStorage.setItem('user', JSON.stringify(userInfo));

                setUser(userInfo);
                setActiveSection(data.data.user?.isVerified ? "personal" : "verification");
            } else {
                setError('Failed to fetch profile data');
            }
        } catch (err) {
            setError('Error loading profile data');
            console.error('Fetch profile error:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchUserStats = async () => {
        try {
            const { data } = await axiosInstance.get('/api/v1/users/stats/seller');
            if (data.success) {
                setStats(data.data.statistics);
            }
        } catch (err) {
            console.error('Fetch stats error:', err);
        }
    };

    const handleInputChange = (field, value) => {
        setUserData(prev => {
            if (field.includes('.')) {
                // Handle nested fields like address.street
                const [parent, child] = field.split('.');
                return {
                    ...prev,
                    [parent]: {
                        ...prev[parent],
                        [child]: value
                    }
                };
            } else {
                // Handle direct fields like firstName, lastName
                return {
                    ...prev,
                    [field]: value
                };
            }
        });
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);

            const formData = new FormData();

            // Add personal info - use the direct field names
            formData.append('firstName', userData.firstName || '');
            formData.append('lastName', userData.lastName || '');
            formData.append('phone', userData.phone || '');

            if (userData.companyName) {
                formData.append('companyName', userData.address.companyName || '');
            }

            if (userData.companyVATNumber) {
                formData.append('companyVATNumber', userData.address.companyVATNumber || '');
            }

            // Add address if it exists
            if (userData.address) {
                formData.append('line1', userData.address.line1 || '');
                formData.append('line2', userData.address.line2 || '');
                formData.append('county', userData.address.county || '');
                formData.append('state', userData.address.state || '');
                formData.append('postCode', userData.address.postCode || '');
                formData.append('country', userData.address.country || '');
            }

            // Add country info
            formData.append('countryCode', userData.countryCode || '');
            formData.append('countryName', userData.countryName || '');

            // Add currency
            formData.append('currency', userData.currency || '');

            // Add image if changed
            if (imageFile) {
                formData.append('image', imageFile);
            }

            const { data } = await axiosInstance.put('/api/v1/users/profile', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (data.success) {
                setUserData(data.data.user);
                const userInfo = {
                    _id: data.data.user._id,
                    firstName: data.data.user.firstName,
                    lastName: data.data.user.lastName,
                    username: data.data.user.username,
                    userType: data.data.user.userType,
                    email: data.data.user.email,
                    phone: data.data.user.phone,
                    isVerified: data.data.user.isVerified,
                    isActive: data.data.user.isActive,
                    image: data.data.user.image,
                    createdAt: data.data.user.createdAt,
                    countryName: data.data.user.countryName,
                    countryCode: data.data.user.countryCode,
                    currency: data.data.user.currency,
                };
                localStorage.setItem('user', JSON.stringify(userInfo));
                setIsEditing(false);
                setImagePreview(null);
                setImageFile(null);
                // You can add a toast notification here
            }
        } catch (err) {
            setError('Failed to update profile');
            console.error('Update profile error:', err);
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordChange = async (passwords) => {
        try {
            setSaving(true);
            const { data } = await axiosInstance.put('/api/v1/users/change-password', passwords);
            if (data.success) {
                // You can add a toast notification here
                return true;
            }
        } catch (err) {
            setError('Failed to change password');
            console.error('Change password error:', err);
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handlePreferencesChange = async (preferences) => {
        try {
            const { data } = await axiosInstance.put(
                "/api/v1/users/preferences",
                { preferences }
            );
            if (data.success) {
                setUserData(data.data.user);
                return true;
            }
            return false;
        } catch (err) {
            setError("Failed to update preferences");
            console.error("Update preferences error:", err);
            return false;
        }
    };

    const handleCancel = () => {
        fetchUserData(); // Reload original data
        setIsEditing(false);
        setImagePreview(null);
        setImageFile(null);
        setError(null);
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const togglePreference = async (preference) => {
        const newPreferences = {
            ...userData.preferences,
            [preference]: !userData.preferences[preference]
        };

        const success = await handlePreferencesChange(newPreferences);
        if (success) {
            setUserData(prev => ({
                ...prev,
                preferences: newPreferences
            }));
        }
    };

    const handleIdentificationDocumentChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                toast.error('File size should be less than 5MB');
                return;
            }

            // Validate file type
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
            if (!allowedTypes.includes(file.type)) {
                toast.error('Please upload JPG, PNG, or PDF files only');
                return;
            }

            setIdentificationDocument(file);

            // Create preview for images
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setIdentificationDocumentPreview(reader.result);
                };
                reader.readAsDataURL(file);
            } else {
                // For PDFs, just show the file name
                setIdentificationDocumentPreview(null);
            }
        }
    };

    const handleIdentificationUpload = async () => {
        if (!identificationDocument) {
            toast.error('Please select a document to upload');
            return;
        }

        try {
            setUploadingId(true);
            const formData = new FormData();
            formData.append('identificationDocument', identificationDocument);

            const { data } = await axiosInstance.post(
                '/api/v1/users/upload-identification',
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    },
                    onUploadProgress: (progressEvent) => {
                        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        setIdUploadProgress(percentCompleted);
                    }
                }
            );

            if (data.success) {
                toast.success('Identification document uploaded successfully');
                setUserData(data.data.user);
                setIdentificationDocument(null);
                setIdentificationDocumentPreview(null);
                setIdUploadProgress(0);
            }
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to upload document');
            console.error('Upload error:', error);
        } finally {
            setUploadingId(false);
        }
    };

    const removeIdentificationDocument = () => {
        setIdentificationDocument(null);
        setIdentificationDocumentPreview(null);
        document.getElementById('identificationDocument').value = '';
    };

    const viewDocument = (url) => {
        window.open(url, '_blank');
    };

    const sections = [
        { id: "personal", label: "Personal Info", icon: <User size={18} /> },
        { id: "address", label: "Address", icon: <MapPin size={18} /> },
        // { id: "verification", label: "ID Verification", icon: <FileText size={18} /> },
        { id: "preferences", label: "Notifications", icon: <Bell size={18} /> },
        { id: "security", label: "Security", icon: <Shield size={18} /> }
    ];

    if (loading) {
        return (
            <section className="flex min-h-screen">
                <CompanySidebar />
                <div className="w-full relative">
                    <CompanyHeader />
                    <CompanyContainer>
                        <div className="flex justify-center items-center min-h-96">
                            {/* <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div> */}
                            <LoadingSpinner />
                        </div>
                    </CompanyContainer>
                </div>
            </section>
        );
    }

    if (!userData) {
        return (
            <section className="flex min-h-screen">
                <CompanySidebar />
                <div className="w-full relative">
                    <CompanyHeader />
                    <CompanyContainer>
                        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                            <p className="text-red-600">Failed to load profile data</p>
                            <button
                                onClick={fetchUserData}
                                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                            >
                                Try Again
                            </button>
                        </div>
                    </CompanyContainer>
                </div>
            </section>
        );
    }

    return (
        <section className="flex min-h-screen">
            <CompanySidebar />

            <div className="w-full relative">
                <CompanyHeader />

                <CompanyContainer>
                    <div className="max-w-full pt-16 pb-7 md:pt-0">
                        <h2 className="text-3xl md:text-4xl font-bold my-5">Company Profile</h2>
                        {/* <p className="text-secondary">Manage your account settings and bidding preferences</p> */}
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                            <p className="text-red-600">{error}</p>
                        </div>
                    )}

                    <div className="flex flex-col lg:flex-row gap-6">
                        {/* Sidebar Navigation */}
                        <div className="lg:w-1/4">
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                                <div className="flex flex-col gap-2">
                                    {sections.map(section => (
                                        <button
                                            key={section.id}
                                            onClick={() => setActiveSection(section.id)}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${activeSection === section.id
                                                ? `text-white bg-orange-500 font-medium`
                                                : "text-secondary hover:bg-gray-100"
                                                }`}
                                        >
                                            {section.icon}
                                            <span>{section.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Main Content */}
                        <div className="lg:w-3/4">
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                {/* Header with Edit/Save buttons */}
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl font-semibold">
                                        {sections.find(s => s.id === activeSection)?.label}
                                    </h3>
                                    {activeSection !== 'preferences' && activeSection !== 'security' && (
                                        <div className="flex gap-2">
                                            {isEditing ? (
                                                <>
                                                    <button
                                                        onClick={handleSave}
                                                        disabled={saving}
                                                        className="flex items-center gap-2 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 text-white hover:from-orange-500 hover:via-orange-600 hover:to-orange-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                                                    >
                                                        <Save size={16} />
                                                        {saving ? 'Saving...' : 'Save Changes'}
                                                    </button>
                                                    <button
                                                        onClick={handleCancel}
                                                        disabled={saving}
                                                        className="flex items-center gap-2 bg-gray-200 text-secondary px-4 py-2 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                                                    >
                                                        <X size={16} />
                                                        Cancel
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => setIsEditing(true)}
                                                    className="flex items-center gap-2 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 text-white hover:from-orange-500 hover:via-orange-600 hover:to-orange-700 px-4 py-2 rounded-lg transition-colors"
                                                >
                                                    <Edit size={16} />
                                                    Edit
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Personal Information Section */}
                                {activeSection === "personal" && (
                                    <div className="space-y-6">
                                        <div className="flex flex-col md:flex-row gap-8 items-start">
                                            <div className="flex flex-col items-center">
                                                {/* Avatar upload section remains the same */}
                                                <div className="relative group">
                                                    <img
                                                        src={imagePreview || userData.image || '/api/placeholder/100/100'}
                                                        alt="Profile"
                                                        className="w-24 h-24 rounded-full object-cover border-4 border-gray-200"
                                                    />
                                                    {isEditing && (
                                                        <>
                                                            <div className="absolute inset-0 bg-black bg-opacity-40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                                                <label className="text-white cursor-pointer">
                                                                    <Camera size={24} />
                                                                    <input
                                                                        type="file"
                                                                        className="hidden"
                                                                        onChange={handleImageChange}
                                                                        accept="image/*"
                                                                        name="image"
                                                                    />
                                                                </label>
                                                            </div>
                                                            <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-white rounded-full p-1 shadow-md">
                                                                <Upload size={12} className="text-secondary" />
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                                {isEditing && (
                                                    <p className="text-sm text-gray-500 mt-3">Click on image to upload new photo</p>
                                                )}
                                            </div>

                                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="block text-sm font-medium text-secondary">Contact First Name</label>
                                                    <input
                                                        type="text"
                                                        value={userData.firstName || ''}
                                                        onChange={(e) => handleInputChange('firstName', e.target.value)}
                                                        disabled={!isEditing}
                                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="block text-sm font-medium text-secondary">Contact Last Name</label>
                                                    <input
                                                        type="text"
                                                        value={userData.lastName || ''}
                                                        onChange={(e) => handleInputChange('lastName', e.target.value)}
                                                        disabled={!isEditing}
                                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100"
                                                    />
                                                </div>
                                                <div className="space-y-1 md:col-span-2">
                                                    <label className="block text-sm font-medium text-secondary">Company Name</label>
                                                    <div className="flex items-center gap-2">
                                                        <Building size={18} className="text-gray-400" />
                                                        <input
                                                            type="text"
                                                            value={userData.companyName || ''}
                                                            disabled={!isEditing}
                                                            onChange={(e) => handleInputChange('companyName', e.target.value)}
                                                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1 md:col-span-2">
                                                    <label className="block text-sm font-medium text-secondary">VAT Number</label>
                                                    <div className="flex items-center gap-2">
                                                        <FileText size={18} className="text-gray-400" />
                                                        <input
                                                            type="text"
                                                            value={userData.companyVATNumber || ''}
                                                            disabled={!isEditing}
                                                            onChange={(e) => handleInputChange('companyVATNumber', e.target.value)}
                                                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1 md:col-span-1">
                                                    <label className="block text-sm font-medium text-secondary">Email</label>
                                                    <div className="flex items-center gap-2">
                                                        <Mail size={18} className="text-gray-400" />
                                                        <input
                                                            type="email"
                                                            value={userData.email || ''}
                                                            disabled
                                                            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-100"
                                                        />
                                                    </div>
                                                    {/* <p className="text-sm text-gray-500 mt-1">Email cannot be changed</p> */}
                                                </div>
                                                <div className="space-y-1 md:col-span-1">
                                                    <label className="block text-sm font-medium text-secondary">Phone</label>
                                                    <div className="flex items-center gap-2">
                                                        <Phone size={18} className="text-gray-400" />
                                                        <input
                                                            type="tel"
                                                            value={userData.phone || ''}
                                                            onChange={(e) => handleInputChange('phone', e.target.value)}
                                                            disabled={!isEditing}
                                                            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="block text-sm font-medium text-secondary">Username</label>
                                                    <input
                                                        type="text"
                                                        value={userData.username || ''}
                                                        disabled
                                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-100"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-sm font-medium leading-none text-secondary flex items-center gap-2">
                                                        <span>Currency</span>
                                                    </label>
                                                    <div className="relative">
                                                        <select
                                                            value={userData.currency || ''}
                                                            onChange={(e) => handleInputChange('currency', e.target.value)}
                                                            disabled={!isEditing}
                                                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent appearance-none disabled:bg-gray-100"
                                                        >
                                                            <option value="">Select currency</option>
                                                            {currencies.map(currency => (
                                                                <option key={currency.code} value={currency.code}>
                                                                    {currency.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown size={20} className="absolute right-3 top-3 text-secondary pointer-events-none" />
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="block text-sm font-medium text-secondary">Member Since</label>
                                                    <input
                                                        type="text"
                                                        value={new Date(userData.createdAt).toLocaleDateString('en-IE')}
                                                        disabled
                                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-100"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Address Section */}
                                {activeSection === "address" && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                        <div className="space-y-1">
                                            <label className="block text-sm font-medium text-secondary">Country</label>
                                            <input
                                                type="text"
                                                value={userData.address?.country || userData.countryName || ''}
                                                onChange={(e) => handleInputChange('address.country', e.target.value)}
                                                disabled={!isEditing}
                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100"
                                                placeholder="Country"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-sm font-medium text-secondary">County</label>
                                            <input
                                                type="text"
                                                value={userData.address?.county || ''}
                                                onChange={(e) => handleInputChange('address.county', e.target.value)}
                                                disabled={!isEditing}
                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100"
                                                placeholder="County"
                                            />
                                        </div>
                                        {/* <div className="space-y-1">
                                            <label className="block text-sm font-medium text-secondary">State</label>
                                            <input
                                                type="text"
                                                value={userData.address?.state || ''}
                                                onChange={(e) => handleInputChange('address.state', e.target.value)}
                                                disabled={!isEditing}
                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100"
                                                placeholder="State"
                                            />
                                        </div> */}
                                        <div className="space-y-1">
                                            <label className="block text-sm font-medium text-secondary">Post/EIR Code</label>
                                            <input
                                                type="text"
                                                value={userData.address?.postCode || ''}
                                                onChange={(e) => handleInputChange('address.postCode', e.target.value)}
                                                disabled={!isEditing}
                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100"
                                                placeholder="Postal code"
                                            />
                                        </div>
                                        <div className="md:col-span-3 space-y-1">
                                            <label className="block text-sm font-medium text-secondary">Address Line 1</label>
                                            <input
                                                type="text"
                                                value={userData.address?.line1 || ''}
                                                onChange={(e) => handleInputChange('address.line1', e.target.value)}
                                                disabled={!isEditing}
                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100"
                                                placeholder="Address Line 1"
                                            />
                                        </div>
                                        <div className="md:col-span-3 space-y-1">
                                            <label className="block text-sm font-medium text-secondary">Address Line 2</label>
                                            <input
                                                type="text"
                                                value={userData.address?.line2 || ''}
                                                onChange={(e) => handleInputChange('address.line2', e.target.value)}
                                                disabled={!isEditing}
                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100"
                                                placeholder="Address Line 2"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Security Section */}
                                {activeSection === "security" && (
                                    <>
                                        <PasswordChangeForm
                                            onChangePassword={handlePasswordChange}
                                            saving={saving}
                                        />
                                        <DeleteAccountPanel />
                                    </>
                                )}
                                {/* ID Verification Section */}
                                {activeSection === "verification" && (
                                    <div className="space-y-6">
                                        {/* Current Status Card */}
                                        <div className={`rounded-lg p-4 ${userData.identificationStatus === 'verified' ? 'bg-green-50 border border-green-200' :
                                            userData.identificationStatus === 'pending' ? 'bg-yellow-50 border border-yellow-200' :
                                                userData.identificationStatus === 'rejected' ? 'bg-red-50 border border-red-200' :
                                                    'bg-gray-50 border border-gray-200'
                                            }`}>
                                            <div className="flex items-start gap-3">
                                                {userData.identificationStatus === 'verified' && <CheckCircle className="text-green-600 flex-shrink-0" size={24} />}
                                                {userData.identificationStatus === 'pending' && <Clock className="text-yellow-600 flex-shrink-0" size={24} />}
                                                {userData.identificationStatus === 'rejected' && <AlertCircle className="text-red-600 flex-shrink-0" size={24} />}
                                                {!userData.identificationStatus && <Shield className="text-gray-600 flex-shrink-0" size={24} />}

                                                <div className="flex-1">
                                                    <h4 className="font-semibold text-lg mb-1">
                                                        {userData.identificationStatus === 'verified' && 'Identity Verified'}
                                                        {userData.identificationStatus === 'pending' && 'Verification Pending'}
                                                        {userData.identificationStatus === 'rejected' && 'Verification Rejected'}
                                                        {!userData.identificationStatus && 'Identity Verification Required'}
                                                    </h4>

                                                    {userData.identificationStatus === 'verified' && (
                                                        <>
                                                            <p className="text-green-700 mb-2">
                                                                Your identity has been verified on {new Date(userData.identificationVerifiedAt).toLocaleDateString()}
                                                            </p>
                                                        </>
                                                    )}

                                                    {userData.identificationStatus === 'pending' && (
                                                        <p className="text-yellow-700">
                                                            Your identification document is being reviewed. This usually takes 1-2 business days.
                                                        </p>
                                                    )}

                                                    {userData.identificationStatus === 'rejected' && (
                                                        <>
                                                            <p className="text-red-700 mb-2">
                                                                Your identification document was rejected.
                                                            </p>
                                                            {userData.identificationRejectionReason && (
                                                                <div className="bg-red-100 p-3 rounded-lg mb-3">
                                                                    <strong className="text-red-800 block mb-1">Reason:</strong>
                                                                    <p className="text-red-700">{userData.identificationRejectionReason}</p>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}

                                                    {!userData.identificationStatus && (
                                                        <p className="text-gray-700">
                                                            Please upload a valid government-issued ID to verify your identity.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Document Preview Section - Show if document exists */}
                                        {userData.identificationDocument && (
                                            <div className="border rounded-lg overflow-hidden">
                                                <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
                                                    <h4 className="font-semibold">
                                                        {userData.identificationStatus === 'rejected' ? 'Rejected Document' : 'Uploaded Document'}
                                                    </h4>
                                                    <button
                                                        onClick={() => window.open(userData.identificationDocument, '_blank')}
                                                        className="flex items-center gap-2 text-primary hover:underline"
                                                    >
                                                        <Eye size={16} />
                                                        View Full Size
                                                    </button>
                                                </div>

                                                <div className="p-4">
                                                    {/* Check if it's an image or PDF based on URL */}
                                                    {userData.identificationDocument.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                                        <div className="relative group">
                                                            <img
                                                                src={userData.identificationDocument}
                                                                alt="Identification Document"
                                                                className="max-h-64 w-auto mx-auto rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                                                                onClick={() => window.open(userData.identificationDocument, '_blank')}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                                            <div className="flex items-center gap-3">
                                                                <FileText size={32} className="text-primary" />
                                                                <div>
                                                                    <p className="font-medium">PDF Document</p>
                                                                    <a
                                                                        href={userData.identificationDocument}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-primary text-sm hover:underline flex items-center gap-1"
                                                                    >
                                                                        <Download size={14} />
                                                                        Download PDF
                                                                    </a>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Upload Section - Show only if not verified or rejected */}
                                        {(userData.identificationStatus !== 'verified' || !userData.identificationDocument) && (
                                            <div className="border-t pt-6">
                                                <h4 className="font-semibold text-lg mb-4">
                                                    {userData.identificationStatus === 'rejected' ? 'Upload New Document' : 'Upload Document'}
                                                </h4>

                                                <div className="space-y-4">
                                                    {/* Guidelines */}
                                                    <div className="bg-blue-50 p-4 rounded-lg">
                                                        <h5 className="font-medium text-blue-800 mb-2">Document Guidelines:</h5>
                                                        <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
                                                            <li>Valid government-issued ID (Passport, Driver's License, or National ID)</li>
                                                            <li>Document must be clear and all text should be readable</li>
                                                            <li>Document must not be expired</li>
                                                            <li>Accepted formats: JPG, PNG, PDF (Max 5MB)</li>
                                                        </ul>
                                                    </div>

                                                    {/* File Upload Area */}
                                                    <div className="relative">
                                                        <input
                                                            type="file"
                                                            id="identificationDocument"
                                                            accept=".jpg,.jpeg,.png,.pdf"
                                                            onChange={handleIdentificationDocumentChange}
                                                            className="hidden"
                                                            disabled={uploadingId}
                                                        />

                                                        {!identificationDocument ? (
                                                            <label
                                                                htmlFor="identificationDocument"
                                                                className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${uploadingId
                                                                    ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
                                                                    : 'border-gray-300 hover:border-primary hover:bg-blue-50'
                                                                    }`}
                                                            >
                                                                <Upload size={24} className="text-gray-400 mb-2" />
                                                                <span className="text-sm text-gray-600">Click to upload or drag and drop</span>
                                                                <span className="text-xs text-gray-500 mt-1">JPG, PNG, or PDF (Max 5MB)</span>
                                                            </label>
                                                        ) : (
                                                            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50">
                                                                <div className="flex items-center gap-3">
                                                                    {identificationDocument.type.startsWith('image/') && identificationDocumentPreview ? (
                                                                        <img
                                                                            src={identificationDocumentPreview}
                                                                            alt="ID Preview"
                                                                            className="w-12 h-12 object-cover rounded"
                                                                        />
                                                                    ) : (
                                                                        <FileText size={24} className="text-primary" />
                                                                    )}
                                                                    <div>
                                                                        <p className="text-sm font-medium text-gray-700">{identificationDocument.name}</p>
                                                                        <p className="text-xs text-gray-500">
                                                                            {(identificationDocument.size / 1024 / 1024).toFixed(2)} MB
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={removeIdentificationDocument}
                                                                    className="p-1 hover:bg-gray-200 rounded-full transition-colors"
                                                                    disabled={uploadingId}
                                                                >
                                                                    <X size={20} className="text-gray-500" />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Upload Progress Bar */}
                                                    {idUploadProgress > 0 && idUploadProgress < 100 && (
                                                        <div className="space-y-2">
                                                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                                                                <div
                                                                    className="bg-primary h-2.5 rounded-full transition-all duration-300"
                                                                    style={{ width: `${idUploadProgress}%` }}
                                                                ></div>
                                                            </div>
                                                            <p className="text-sm text-gray-600 text-center">Uploading: {idUploadProgress}%</p>
                                                        </div>
                                                    )}

                                                    {/* Upload Button */}
                                                    {identificationDocument && (
                                                        <button
                                                            onClick={handleIdentificationUpload}
                                                            disabled={uploadingId}
                                                            className="w-full bg-primary text-white hover:bg-primary/90 py-3 px-4 rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                                        >
                                                            {uploadingId ? (
                                                                <>
                                                                    <RefreshCw size={18} className="animate-spin" />
                                                                    Uploading...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Upload size={18} />
                                                                    Upload Document
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeSection === "preferences" && (
                                    <PreferencesPanel
                                        initialPreferences={userData.preferences}
                                        onSave={handlePreferencesChange}
                                        saving={saving}
                                    />
                                )}
                            </div>

                            {/* Company Stats Cards */}
                            {stats && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-5">
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center">
                                        <div className="p-3 rounded-lg mr-4 bg-blue-100">
                                            <Award size={20} className="text-blue-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">Total Auctions</p>
                                            <p className="font-semibold text-lg">{stats.totalAuctions}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center">
                                        <div className="p-3 rounded-lg mr-4 bg-green-100">
                                            <TrendingUp size={20} className="text-green-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">Sold Auctions</p>
                                            <p className="font-semibold text-lg">{stats.soldAuctions}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center">
                                        <div className="p-3 rounded-lg mr-4 bg-amber-100">
                                            <Target size={20} className="text-amber-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">Success Rate</p>
                                            <p className="font-semibold text-lg">{stats.successRate}%</p>
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center">
                                        <div className="p-3 rounded-lg mr-4 bg-purple-100">
                                            <EuroIcon size={20} className="text-purple-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">Total Revenue</p>
                                            <p className="font-semibold text-lg">
                                                {new Intl.NumberFormat('en-IE', {
                                                    style: 'currency',
                                                    currency: `${userCurrency}`,
                                                    minimumFractionDigits: 0
                                                }).format(stats.totalRevenue)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center">
                                        <div className="p-3 rounded-lg mr-4 bg-red-100">
                                            <Gavel size={20} className="text-red-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">Total Bids Received</p>
                                            <p className="font-semibold text-lg">{stats.totalBidsReceived}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center">
                                        <div className="p-3 rounded-lg mr-4 bg-indigo-100">
                                            <BarChart3 size={20} className="text-indigo-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">Avg. Sale Price</p>
                                            <p className="font-semibold text-lg">
                                                {new Intl.NumberFormat('en-IE', {
                                                    style: 'currency',
                                                    currency: `${userCurrency}`,
                                                    minimumFractionDigits: 0
                                                }).format(stats.avgSalePrice)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </CompanyContainer>
            </div>
        </section>
    );
}

// Password Change Form Component
const PasswordChangeForm = ({ onChangePassword, saving }) => {
    const [passwords, setPasswords] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');

        if (passwords.newPassword !== passwords.confirmPassword) {
            setMessage('New passwords do not match');
            return;
        }

        if (passwords.newPassword.length < 6) {
            setMessage('New password must be at least 6 characters long');
            return;
        }

        const success = await onChangePassword({
            currentPassword: passwords.currentPassword,
            newPassword: passwords.newPassword
        });

        if (success) {
            setMessage('Password changed successfully');
            setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
        }
    };

    return (
        <div className="space-y-6">
            <div className="rounded-lg p-4 bg-blue-50 border border-blue-200">
                <p className="text-sm text-secondary">
                    Use a strong password that's hard to guess. Strong password provides you an additional layer of security to your account and data.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                    <label className="block text-sm font-medium text-secondary">Current Password</label>
                    <div className="flex items-center gap-2">
                        <Lock size={18} className="text-gray-400" />
                        <input
                            type="password"
                            value={passwords.currentPassword}
                            onChange={(e) => setPasswords(prev => ({ ...prev, currentPassword: e.target.value }))}
                            required
                            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="block text-sm font-medium text-secondary">New Password</label>
                    <div className="flex items-center gap-2">
                        <Lock size={18} className="text-gray-400" />
                        <input
                            type="password"
                            value={passwords.newPassword}
                            onChange={(e) => setPasswords(prev => ({ ...prev, newPassword: e.target.value }))}
                            required
                            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="block text-sm font-medium text-secondary">Confirm New Password</label>
                    <div className="flex items-center gap-2">
                        <Lock size={18} className="text-gray-400" />
                        <input
                            type="password"
                            value={passwords.confirmPassword}
                            onChange={(e) => setPasswords(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            required
                            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                        />
                    </div>
                </div>

                {message && (
                    <div className={`p-3 rounded-lg ${message.includes('successfully') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}>
                        {message}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={saving}
                    className="bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 text-white hover:from-orange-500 hover:via-orange-600 hover:to-orange-700 px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
                >
                    {saving ? 'Changing Password...' : 'Change Password'}
                </button>
            </form>
        </div>
    );
};

export default Profile;