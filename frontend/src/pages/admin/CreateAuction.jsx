import { useState, useEffect, useRef } from 'react';
import { useScrollTopOnStep } from '../../hooks/useScrollTopOnStep';
import { useForm } from 'react-hook-form';
import parse from 'html-react-parser';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import {
    FileText,
    DollarSign,
    Settings,
    CheckCircle,
    ArrowLeft,
    ArrowRight,
    X,
    Image,
    File,
    Clock,
    MapPin,
    Gavel,
    Youtube,
    Car,
    Cog,
    Trophy,
    Move,
    Fuel,
    Gauge,
    Calendar,
    User,
    ChevronDown,
    ChevronRight,
    AlertCircle,
    Banknote,
    Zap,
    Info
} from "lucide-react";
import { RTE, AdminContainer, AdminHeader, AdminSidebar } from '../../components';
import toast from 'react-hot-toast';
import axiosInstance from '../../utils/axiosInstance.js';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { compressAuctionImages } from '../../utils/compressImage.js';
import { TouchBackend } from 'react-dnd-touch-backend';


// Drag and Drop item types
const ItemTypes = {
    PHOTO: 'photo',
};

// Draggable Photo Component (keep your existing implementation)
const DraggablePhoto = ({ photo, index, movePhoto, removePhoto }) => {
    const ref = useRef(null);

    const [{ isDragging }, drag] = useDrag({
        type: ItemTypes.PHOTO,
        item: { index },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    });

    const [, drop] = useDrop({
        accept: ItemTypes.PHOTO,
        hover(item) {
            if (!ref.current || item.index === index) return;
            movePhoto(item.index, index);
            item.index = index;
        },
    });

    // Chain drag + drop on the same DOM node via useRef (correct pattern)
    drag(drop(ref));

    return (
        <div
            ref={ref}
            className="relative group select-none"
            style={{
                opacity: isDragging ? 0.4 : 1,
                cursor: isDragging ? 'grabbing' : 'grab',
            }}
        >
            <img
                src={URL.createObjectURL(photo)}
                alt={`Upload ${index + 1}`}
                className="w-full h-32 object-cover rounded-lg pointer-events-none"
                draggable={false}
            />

            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-lg flex items-center justify-center pointer-events-none">
                <Move
                    size={20}
                    className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                />
            </div>

            <div className="absolute top-2 left-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded-full pointer-events-none">
                {index + 1}
            </div>

            <button
                type="button"
                onClick={() => removePhoto(index)}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors z-10"
            >
                <X size={14} />
            </button>
        </div>
    );
};

// Photo Gallery Component
const PhotoGallery = ({ photos, movePhoto, removePhoto }) => {
    return (
        <div className="mt-4">
            <p className="text-sm text-secondary mb-3">
                Drag and drop to reorder photos. The first image will be the main thumbnail.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {photos.map((photo, index) => (
                    <DraggablePhoto
                        key={`photo-${index}`}
                        photo={photo}
                        index={index}
                        movePhoto={movePhoto}
                        removePhoto={removePhoto}
                    />
                ))}
            </div>
        </div>
    );
};

// Service History Gallery Component
const ServiceHistoryGallery = ({ serviceRecords, moveServiceRecord, removeServiceRecord }) => {
    return (
        <div className="mt-4">
            <p className="text-sm text-secondary mb-3">
                Drag and drop to reorder other images.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {serviceRecords.map((record, index) => (
                    <DraggablePhoto
                        key={`record-${index}`}
                        photo={record}
                        index={index}
                        movePhoto={moveServiceRecord}
                        removePhoto={removeServiceRecord}
                    />
                ))}
            </div>
        </div>
    );
};

// UploadProgressModal Component
const UploadProgressModal = ({ isOpen, fileCount }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4">
                <div className="flex items-center mb-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mr-3"></div>
                    <h3 className="text-lg font-semibold">Creating Your Auction</h3>
                </div>

                <div className="space-y-3">
                    <p className="text-gray-600">
                        We're uploading {fileCount} file(s) to our secure cloud storage.
                    </p>

                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <p className="text-sm text-yellow-800">
                            ⏳ <strong>Please be patient:</strong> Large files may take several minutes to upload depending on your internet speed.
                        </p>
                    </div>

                    <p className="text-xs text-gray-500 text-center">
                        Do not close this window until the process is complete.
                    </p>
                </div>
            </div>
        </div>
    );
};

// Dynamic Field Renderer Component
const DynamicField = ({ field, register, errors, watch, setValue }) => {
    const fieldName = `specifications.${field.name}`;
    const error = errors.specifications?.[field.name];

    // Ensure we have a label
    const fieldLabel = field.label || field.name || 'Field';

    // Generate a sensible placeholder if not provided
    const fieldPlaceholder = field.placeholder || `Enter ${fieldLabel.toLowerCase()}`;

    // Common input classes
    const inputClasses = `w-full p-3 border ${error ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-black focus:border-transparent`;

    // Helper text for units
    const unitText = field.unit ? ` (${field.unit})` : '';

    // Add inheritance badge if needed
    const InheritanceBadge = field.source === 'inherited' ? (
        <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            Inherited from {field.sourceCategory?.name}
        </span>
    ) : null;

    switch (field.fieldType) {
        case 'textarea':
            return (
                <div className="space-y-2">
                    <div className="flex items-center">
                        <label htmlFor={field.name} className="block text-sm font-medium text-gray-700">
                            {fieldLabel} {field.required && <span className="text-red-500">*</span>}
                            {unitText}
                        </label>
                        {InheritanceBadge}
                    </div>
                    <textarea
                        {...register(fieldName, {
                            required: field.required ? `${fieldLabel} is required` : false,
                            minLength: field.validation?.minLength ? {
                                value: field.validation.minLength,
                                message: `Minimum ${field.validation.minLength} characters`
                            } : undefined,
                            maxLength: field.validation?.maxLength ? {
                                value: field.validation.maxLength,
                                message: `Maximum ${field.validation.maxLength} characters`
                            } : undefined,
                            pattern: field.validation?.pattern ? {
                                value: new RegExp(field.validation.pattern),
                                message: field.validation.message || `Invalid format for ${fieldLabel}`
                            } : undefined
                        })}
                        id={field.name}
                        rows={3}
                        placeholder={fieldPlaceholder}
                        className={inputClasses}
                    />
                    {error && <p className="text-red-500 text-sm">{error.message}</p>}
                </div>
            );

        case 'select':
            return (
                <div className="space-y-2">
                    <div className="flex items-center">
                        <label htmlFor={field.name} className="block text-sm font-medium text-gray-700">
                            {fieldLabel} {field.required && <span className="text-red-500">*</span>}
                            {unitText}
                        </label>
                        {InheritanceBadge}
                    </div>
                    <select
                        {...register(fieldName, {
                            required: field.required ? `${fieldLabel} is required` : false
                        })}
                        id={field.name}
                        className={inputClasses}
                    >
                        <option value="">Select {fieldLabel}</option>
                        {field.options?.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    {error && <p className="text-red-500 text-sm">{error.message}</p>}
                </div>
            );

        case 'number':
            return (
                <div className="space-y-2">
                    <div className="flex items-center">
                        <label htmlFor={field.name} className="block text-sm font-medium text-gray-700">
                            {fieldLabel} {field.required && <span className="text-red-500">*</span>}
                            {unitText}
                        </label>
                        {InheritanceBadge}
                    </div>
                    <input
                        {...register(fieldName, {
                            required: field.required ? `${fieldLabel} is required` : false,
                            min: field.validation?.min ? {
                                value: parseFloat(field.validation.min),
                                message: `Minimum value is ${field.validation.min}${field.unit ? ` ${field.unit}` : ''}`
                            } : undefined,
                            max: field.validation?.max ? {
                                value: parseFloat(field.validation.max),
                                message: `Maximum value is ${field.validation.max}${field.unit ? ` ${field.unit}` : ''}`
                            } : undefined
                        })}
                        id={field.name}
                        type="number"
                        step="any"
                        placeholder={fieldPlaceholder}
                        className={inputClasses}
                    />
                    {error && <p className="text-red-500 text-sm">{error.message}</p>}
                </div>
            );

        case 'date':
            return (
                <div className="space-y-2">
                    <div className="flex items-center">
                        <label htmlFor={field.name} className="block text-sm font-medium text-gray-700">
                            {fieldLabel} {field.required && <span className="text-red-500">*</span>}
                        </label>
                        {InheritanceBadge}
                    </div>
                    <input
                        {...register(fieldName, {
                            required: field.required ? `${fieldLabel} is required` : false
                        })}
                        id={field.name}
                        type="date"
                        className={inputClasses}
                    />
                    {error && <p className="text-red-500 text-sm">{error.message}</p>}
                </div>
            );

        case 'boolean':
            return (
                <div className="space-y-2">
                    <div className="flex items-center">
                        <input
                            {...register(fieldName)}
                            id={field.name}
                            type="checkbox"
                            className="h-4 w-4 text-black rounded focus:ring-black border-gray-300"
                        />
                        <label htmlFor={field.name} className="ml-2 block text-sm text-gray-700">
                            {fieldLabel} {field.required && <span className="text-red-500">*</span>}
                        </label>
                        {InheritanceBadge}
                    </div>
                    {error && <p className="text-red-500 text-sm">{error.message}</p>}
                </div>
            );

        default: // text
            return (
                <div className="space-y-2">
                    <div className="flex items-center">
                        <label htmlFor={field.name} className="block text-sm font-medium text-gray-700">
                            {fieldLabel} {field.required && <span className="text-red-500">*</span>}
                            {unitText}
                        </label>
                        {InheritanceBadge}
                    </div>
                    <input
                        {...register(fieldName, {
                            required: field.required ? `${fieldLabel} is required` : false,
                            minLength: field.validation?.minLength ? {
                                value: field.validation.minLength,
                                message: `Minimum ${field.validation.minLength} characters`
                            } : undefined,
                            maxLength: field.validation?.maxLength ? {
                                value: field.validation.maxLength,
                                message: `Maximum ${field.validation.maxLength} characters`
                            } : undefined,
                            pattern: field.validation?.pattern ? {
                                value: new RegExp(field.validation.pattern),
                                message: field.validation.message || `Invalid format for ${fieldLabel}`
                            } : undefined
                        })}
                        id={field.name}
                        type={field.fieldType === 'text' ? 'text' : field.fieldType}
                        placeholder={fieldPlaceholder}
                        className={inputClasses}
                    />
                    {error && <p className="text-red-500 text-sm">{error.message}</p>}
                </div>
            );
    }
};

const CreateAuction = () => {
    const [step, setStep] = useState(1);
    useScrollTopOnStep(step);
    const [uploadedPhotos, setUploadedPhotos] = useState([]);
    const [uploadedDocuments, setUploadedDocuments] = useState([]);
    const [uploadedServiceRecords, setUploadedServiceRecords] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const [isCompressing, setIsCompressing] = useState(false);

    // Category state
    const [parentCategories, setParentCategories] = useState([]);
    const [subCategories, setSubCategories] = useState([]);
    const [selectedParent, setSelectedParent] = useState(null);
    const [categoryFields, setCategoryFields] = useState([]);
    const [loadingFields, setLoadingFields] = useState(false);
    const [loadingCategories, setLoadingCategories] = useState(true);

    const { user } = useAuth();
    const userCurrency = user?.currency || 'EUR';

    // Track whether listing_start has already fired for this session
    const listingStartedRef = useRef(false);

    const handleListingStart = () => {
        if (listingStartedRef.current) return;
        listingStartedRef.current = true;

        gtag('event', 'listing_start', {
            user_type: user?.userType || 'admin'
            // add category: selectedParentSlug later if you want
        });
    };

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        setError,
        clearErrors,
        trigger,
        getValues,
        reset,
        control,
        formState: { errors }
    } = useForm({
        mode: 'onChange',
        defaultValues: {
            auctionType: 'reserve',
            categories: []
        }
    });

    const auctionType = watch('auctionType');
    const startDate = watch('startDate');
    const endDate = watch('endDate');
    const selectedCategory = watch('category'); // This will be the subcategory slug
    const selectedParentSlug = watch('parentCategory');

    const [auctionDates, setAuctionDates] = useState([]);
    const [loadingDates, setLoadingDates] = useState(false);

    useEffect(() => {
        const fetchDates = async () => {
            try {
                setLoadingDates(true);
                const { data } = await axiosInstance.get("/api/v1/auction-dates/active");
                if (data.success) setAuctionDates(data.data.auctionDates);
            } catch (err) {
                console.error("Failed to load auction dates", err);
            } finally {
                setLoadingDates(false);
            }
        };
        fetchDates();
    }, []);

    const selectedAuctionDateId = watch("auctionDateId");
    const selectedAuctionDate = auctionDates.find(
        (s) => s._id === selectedAuctionDateId,
    );

    useEffect(() => {
        if (auctionType !== 'standard' && auctionType !== 'reserve') {
            setValue('auctionDateId', '');
        }
    }, [auctionType, setValue]);

    // Fetch parent categories on mount
    useEffect(() => {
        fetchParentCategories();
    }, []);

    // Fetch subcategories when parent is selected
    useEffect(() => {
        if (selectedParentSlug) {
            fetchSubCategories(selectedParentSlug);
            // Clear previously selected subcategory
            setValue('category', '');
            setCategoryFields([]);
        }
    }, [selectedParentSlug]);

    // Fetch fields when subcategory is selected
    useEffect(() => {
        if (selectedCategory) {
            fetchCategoryFields(selectedCategory);
        } else {
            // Clear fields when no category is selected
            setCategoryFields([]);
        }
    }, [selectedCategory]);

    // Fetch parent categories (level 0)
    const fetchParentCategories = async () => {
        try {
            setLoadingCategories(true);
            const { data } = await axiosInstance.get('/api/v1/categories/public/parents');
            if (data.success) {
                setParentCategories(data.data);
            }
        } catch (error) {
            console.error('Error fetching parent categories:', error);
            toast.error('Failed to load categories');
        } finally {
            setLoadingCategories(false);
        }
    };

    // Fetch subcategories by parent slug
    const fetchSubCategories = async (parentSlug) => {
        try {
            setLoadingCategories(true);
            const { data } = await axiosInstance.get(`/api/v1/categories/public/${parentSlug}/children`);
            if (data.success) {
                setSubCategories(data.data.subcategories);
                setSelectedParent(data.data.parent);
            }
        } catch (error) {
            console.error('Error fetching subcategories:', error);
            toast.error('Failed to load subcategories');
            setSubCategories([]);
        } finally {
            setLoadingCategories(false);
        }
    };

    // Fetch category fields by slug
    const fetchCategoryFields = async (slug) => {
        try {
            setLoadingFields(true);
            const { data } = await axiosInstance.get(`/api/v1/categories/public/by-slug/${slug}/fields`);
            if (data.success) {
                setCategoryFields(data.data.fields || []);
            }
        } catch (error) {
            console.error('Error fetching category fields:', error);
            toast.error('Failed to load category fields');
            setCategoryFields([]);
        } finally {
            setLoadingFields(false);
        }
    };

    // Move photo function for drag and drop
    const movePhoto = (fromIndex, toIndex) => {
        const updatedPhotos = [...uploadedPhotos];
        const [movedPhoto] = updatedPhotos.splice(fromIndex, 1);
        updatedPhotos.splice(toIndex, 0, movedPhoto);
        setUploadedPhotos(updatedPhotos);
    };

    // Move service record function for drag and drop
    const moveServiceRecord = (fromIndex, toIndex) => {
        const updatedRecords = [...uploadedServiceRecords];
        const [movedRecord] = updatedRecords.splice(fromIndex, 1);
        updatedRecords.splice(toIndex, 0, movedRecord);
        setUploadedServiceRecords(updatedRecords);
    };

    // Group fields by their group property
    const groupedFields = categoryFields.reduce((acc, field) => {
        const group = field.group || 'General';
        if (!acc[group]) acc[group] = [];
        acc[group].push(field);
        return acc;
    }, {});

    // Render category-specific fields
    const renderCategoryFields = () => {
        if (loadingFields) {
            return (
                <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                    <span className="ml-3 text-gray-600">Loading fields...</span>
                </div>
            );
        }

        if (categoryFields.length === 0) {
            return (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                    <AlertCircle size={40} className="mx-auto text-gray-400 mb-3" />
                    <h3 className="text-lg font-medium text-gray-700 mb-2">No Custom Fields</h3>
                    <p className="text-gray-500">
                        This category doesn't have any specific fields configured.
                    </p>
                </div>
            );
        }

        return (
            <div className="space-y-8">
                {Object.entries(groupedFields).map(([groupName, fields]) => (
                    <div key={groupName} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <h3 className="font-medium text-gray-700">{groupName}</h3>
                        </div>
                        <div className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {fields
                                    .sort((a, b) => a.order - b.order)
                                    .map((field) => {
                                        // Create a truly unique key
                                        const uniqueKey = `${field.source || 'own'}-${field._id || field.name}-${selectedCategory}`;

                                        return (
                                            <DynamicField
                                                key={uniqueKey}
                                                field={field}
                                                register={register}
                                                errors={errors}
                                                watch={watch}
                                                setValue={setValue}
                                            />
                                        );
                                    })}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const nextStep = async () => {
        let isValid = true;


        if (step === 1) {
            const fieldsToValidate = [
                'title',
                'description',
                'parentCategory',
                'category'
            ];

            if (auctionType === 'standard' || auctionType === 'reserve') {
                fieldsToValidate.push('auctionDateId');
            }

            // Add all required specification fields to validation
            categoryFields.forEach(field => {
                if (field.required) {
                    fieldsToValidate.push(`specifications.${field.name}`);
                }
            });

            const overallValidationPassed = await trigger(fieldsToValidate);

            if (!overallValidationPassed) {
                isValid = false;
            }

            // Check photos are uploaded
            if (uploadedPhotos.length === 0) {
                setError('photos', {
                    type: 'manual',
                    message: 'At least one photo is required'
                });
                isValid = false;
            } else {
                clearErrors('photos');
            }
        }

        if (step === 2) {
            const fieldsToValidate = ['auctionType'];

            if (auctionType === 'standard' || auctionType === 'reserve') {
                fieldsToValidate.push('startPrice', 'bidIncrement');
            }

            if (auctionType === 'reserve') {
                fieldsToValidate.push('reservePrice');
            }

            if (auctionType === 'buy_now') {
                fieldsToValidate.push('buyNowPrice', 'startPrice');
            }

            const overallValidationPassed = await trigger(fieldsToValidate);

            if (!overallValidationPassed) {
                isValid = false;
            }
        }

        if (!isValid) {
            return;
        }

        setStep(step + 1);
    };

    const prevStep = () => {
        setStep(step - 1);
    };

    const handlePhotoUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setIsCompressing(true);
        try {
            const compressed = await compressAuctionImages(files);
            setUploadedPhotos((prev) => [...compressed, ...prev]);
            clearErrors('photos');
        } catch (err) {
            console.error('Image processing failed:', err);
            toast.error('Could not process one or more images');
        } finally {
            setIsCompressing(false);
            e.target.value = ''; // allow re-selecting the same file
        }
    };

    const handleDocumentUpload = (e) => {
        const files = Array.from(e.target.files);
        setUploadedDocuments([...uploadedDocuments, ...files]);
    };

    const handleServiceRecordUpload = (e) => {
        const files = Array.from(e.target.files);
        setUploadedServiceRecords([...uploadedServiceRecords, ...files]);
    };

    const removeServiceRecord = (index) => {
        setUploadedServiceRecords(uploadedServiceRecords.filter((_, i) => i !== index));
    };

    const removePhoto = (index) => {
        const newPhotos = uploadedPhotos.filter((_, i) => i !== index);
        setUploadedPhotos(newPhotos);

        if (newPhotos.length === 0) {
            setError('photos', {
                type: 'manual',
                message: 'At least one photo is required'
            });
        } else {
            clearErrors('photos');
        }
    };

    const removeDocument = (index) => {
        setUploadedDocuments(uploadedDocuments.filter((_, i) => i !== index));
    };

    const createAuctionHandler = async (auctionData) => {
        try {
            setIsLoading(true);
            const accessToken = localStorage.getItem('accessToken');

            const formData = new FormData();

            // Basic Info
            formData.append('title', auctionData.title);
            formData.append('description', auctionData.description);
            formData.append('location', auctionData.location || '');
            formData.append('videoLink', auctionData.video || '');

            // Currency selection (add this line)
            formData.append('baseCurrency', user?.currency || 'EUR');

            // Categories - Store BOTH parent and subcategory for better filtering
            // Your auction model expects an array of strings
            const categoriesToStore = [];

            // Add parent category slug
            if (auctionData.parentCategory) {
                categoriesToStore.push(auctionData.parentCategory);
            }

            // Add subcategory slug (this is the main category for the auction)
            if (auctionData.category) {
                categoriesToStore.push(auctionData.category);
            }

            // Append as JSON string or array - your controller handles both
            formData.append('categories', JSON.stringify(categoriesToStore));

            // Auction settings
            formData.append('auctionType', auctionData.auctionType);
            formData.append('allowOffers', auctionData.allowOffers || false);
            formData.append('paymentCollectionPreference', auctionData.paymentCollectionPreference || 'credit_card');
            formData.append('vatIncluded', Boolean(auctionData.vatIncluded));
            formData.append('features', auctionData.features || '');
            const isTimed =
                auctionData.auctionType === 'standard' ||
                auctionData.auctionType === 'reserve';

            if (isTimed) {
                if (auctionData.auctionDateId) {
                    formData.append('auctionDateId', auctionData.auctionDateId);
                }
                // Do NOT send startDate/endDate — backend derives them from the slot
            } else {
                // buy_now / giveaway — send custom dates only if the user actually entered them
                if (auctionData.startDate) {
                    formData.append('startDate', new Date(auctionData.startDate).toISOString());
                }
                if (auctionData.endDate) {
                    formData.append('endDate', new Date(auctionData.endDate).toISOString());
                }
            }

            // Specifications - Convert to JSON string
            if (auctionData.specifications) {
                formData.append('specifications', JSON.stringify(auctionData.specifications));
            }

            // Pricing - only add if not giveaway or buy now (both are always available)
            if (auctionData.auctionType === 'giveaway' || auctionData.auctionType === 'buy_now') {
                // For giveaways and buy now, set startPrice to 0
                formData.append('startPrice', 0);

                // For buy now, still need to send buyNowPrice
                if (auctionData.auctionType === 'buy_now' && auctionData.buyNowPrice) {
                    formData.append('buyNowPrice', auctionData.buyNowPrice);
                }

                // Optional bid increment for buy now auctions (if you want to allow both)
                if (auctionData.auctionType === 'buy_now' && auctionData.bidIncrement) {
                    formData.append('bidIncrement', auctionData.bidIncrement);
                }
            } else {
                // Regular auctions (standard/reserve)
                if (auctionData.startPrice) {
                    formData.append('startPrice', auctionData.startPrice);
                }

                if (auctionData.auctionType === 'standard' || auctionData.auctionType === 'reserve') {
                    formData.append('bidIncrement', auctionData.bidIncrement);
                }

                if (auctionData.auctionType === 'reserve' && auctionData.reservePrice) {
                    formData.append('reservePrice', auctionData.reservePrice);
                }
            }

            // Append photos
            uploadedPhotos.forEach((photo, index) => {
                formData.append('photos', photo);
            });

            // Append documents
            uploadedDocuments.forEach((doc, index) => {
                formData.append('documents', doc);
            });

            // Append service records
            uploadedServiceRecords.forEach((record, index) => {
                formData.append('serviceRecords', record);
            });

            const { data } = await axiosInstance.post(
                `/api/v1/auctions/create?currency=${userCurrency}`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    }
                }
            );

            if (data && data.success) {
                toast.success(data.message);

                gtag('event', 'listing_submit', {
                    listing_id: data.data?._id,
                    item_name: auctionData.title,
                    category: auctionData.parentCategory,
                    seller_type: user?.userType || 'seller',
                    auction_type: auctionData.auctionType,
                    allow_offers: auctionData.allowOffers || false,
                    vat_included: Boolean(auctionData.vatIncluded),
                    value: Number(auctionData.startPrice || auctionData.buyNowPrice || 0),
                    reserve_price: Number(auctionData.reservePrice || 0),
                    currency: userCurrency
                });

                // Reset form
                setStep(1);
                setUploadedPhotos([]);
                setUploadedDocuments([]);
                setUploadedServiceRecords([]);
                setCategoryFields([]);
                setSubCategories([]);
                setSelectedParent(null);
                reset();
                navigate('/admin/auctions/all');
            }
        } catch (error) {
            const errorMessage = error?.response?.data?.message || 'Failed to create auction';
            toast.error(errorMessage);
            console.log('Create auction error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <DndProvider
            backend={TouchBackend}
            options={{
                enableMouseEvents: true,
                delayTouchStart: 10,
                delayMouseStart: 0,
                touchSlop: 8,
                ignoreContextMenu: true,
            }}
        >
            <section className="flex min-h-[70vh]">
                <AdminSidebar />
                <UploadProgressModal
                    isOpen={isLoading}
                    fileCount={uploadedPhotos.length + uploadedDocuments.length + uploadedServiceRecords.length}
                />

                <div className="w-full relative">
                    <AdminHeader />

                    <AdminContainer>
                        <div className="pt-16 md:py-7">
                            <h1 className="text-3xl md:text-4xl font-bold mb-5">Create Auction</h1>

                            {/* Progress Steps */}
                            <div className="mb-8">
                                <div className="flex items-center justify-between mb-4">
                                    {['Item Info', 'Pricing & Bidding', 'Seller Listing Terms'].map((label, index) => (
                                        <div key={index} className="flex flex-col items-center">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step > index + 1 ? 'bg-green-500 text-white' :
                                                step === index + 1 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'
                                                }`}>
                                                {step > index + 1 ? <CheckCircle size={20} /> : index + 1}
                                            </div>
                                            <span className="text-sm mt-2 hidden md:block">{label}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="w-full bg-gray-200 h-3 rounded-full">
                                    <div
                                        className="bg-black h-3 rounded-full transition-all duration-300"
                                        style={{ width: `${(step / 3) * 100}%` }}
                                    ></div>
                                </div>
                            </div>

                            <form
                                onSubmit={handleSubmit(createAuctionHandler)}
                                onInput={handleListingStart}
                                onChange={handleListingStart}
                                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                                {/* Step 1: Item Information */}
                                {step === 1 && (
                                    <div>
                                        <h2 className="text-xl font-semibold mb-6 flex items-center">
                                            <Car size={20} className="mr-2" />
                                            Item Details
                                        </h2>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                            <div>
                                                <label htmlFor="title" className="block text-sm font-medium text-secondary mb-1">
                                                    Item Name *
                                                </label>
                                                <input
                                                    {...register('title', { required: 'Item name is required' })}
                                                    id="title"
                                                    type="text"
                                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                    placeholder="e.g., 2006 Massey 6480"
                                                />
                                                {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>}
                                            </div>

                                            {/* Category Selection */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                                <div>
                                                    <label htmlFor="parentCategory" className="block text-sm font-medium text-secondary mb-1">
                                                        Category *
                                                    </label>
                                                    <select
                                                        {...register('parentCategory', {
                                                            required: 'Please select a category'
                                                        })}
                                                        id="parentCategory"
                                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                        disabled={loadingCategories}
                                                    >
                                                        <option value="">Select a category</option>
                                                        {parentCategories.map(cat => (
                                                            <option key={cat._id} value={cat.slug}>
                                                                {cat.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {errors.parentCategory && (
                                                        <p className="text-red-500 text-sm mt-1">{errors.parentCategory.message}</p>
                                                    )}
                                                </div>

                                                <div>
                                                    <label htmlFor="category" className="block text-sm font-medium text-secondary mb-1">
                                                        Subcategory *
                                                    </label>
                                                    <select
                                                        {...register('category', {
                                                            required: 'Please select a subcategory'
                                                        })}
                                                        id="category"
                                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                        disabled={!selectedParentSlug || loadingCategories}
                                                    >
                                                        <option value="">Select a subcategory</option>
                                                        {subCategories.map(sub => (
                                                            <option key={sub._id} value={sub.slug}>
                                                                {sub.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {errors.category && (
                                                        <p className="text-red-500 text-sm mt-1">{errors.category.message}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Dynamic Fields for Selected Subcategory */}
                                        {selectedCategory && (
                                            <div className="mb-6">
                                                <div className="mb-4 pb-2 border-b border-gray-200">
                                                    <h3 className="text-lg font-medium text-gray-800">
                                                        {selectedParent?.name} - {subCategories.find(s => s.slug === selectedCategory)?.name || 'Category'} Specifications
                                                    </h3>
                                                    <p className="text-sm text-gray-500 mt-1">
                                                        Please provide the following details about your item
                                                    </p>
                                                </div>
                                                {renderCategoryFields()}
                                            </div>
                                        )}

                                        <div className="mb-6">
                                            <label htmlFor="description" className="block text-sm font-medium text-secondary mb-1">
                                                Description *
                                            </label>
                                            <RTE
                                                name="description"
                                                control={control}
                                                rules={{ required: "Description is required" }}
                                                placeholder="Describe the item's history, condition, and any notable details..."
                                            />
                                            {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description.message}</p>}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                            <div>
                                                <label htmlFor="location" className="block text-sm font-medium text-secondary mb-1">
                                                    Location
                                                </label>
                                                <div className="relative">
                                                    <MapPin size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                                    <input
                                                        {...register('location')}
                                                        id="location"
                                                        type="text"
                                                        className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                        placeholder="e.g., Cavan, Ireland"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label htmlFor="video" className="block text-sm font-medium text-secondary mb-1">
                                                    Video Link
                                                </label>
                                                <div className="relative">
                                                    <Youtube size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                                    <input
                                                        {...register('video', {
                                                            pattern: {
                                                                value: /^(https?\:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/,
                                                                message: 'Please enter a valid YouTube URL'
                                                            }
                                                        })}
                                                        id="video"
                                                        type="url"
                                                        className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                        placeholder="YouTube video URL (walkaround, test drive)"
                                                    />
                                                </div>
                                                {errors.video && <p className="text-red-500 text-sm mt-1">{errors.video.message}</p>}
                                            </div>

                                            <p className='text-xs font-medium text-orange-500 md:col-span-2'>Note: Ads with videos tend to get higher prices and less phone calls. If you want to upload a video with your ad, please WhatsApp it to: 87 203 9257</p>
                                        </div>

                                        {/* AUCTION DATE SLOT — only for timed auctions */}
                                        {(auctionType === "standard" || auctionType === "reserve") ? (
                                            <div className="mb-6">
                                                <label
                                                    htmlFor="auctionDateId"
                                                    className="block text-sm font-medium text-secondary mb-1"
                                                >
                                                    Auction Period *
                                                </label>
                                                <div className="relative">
                                                    <Calendar
                                                        size={18}
                                                        className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                                                    />
                                                    <select
                                                        {...register("auctionDateId", {
                                                            required: "Please select an auction period",
                                                        })}
                                                        id="auctionDateId"
                                                        disabled={loadingDates}
                                                        className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                    >
                                                        <option value="">
                                                            {loadingDates ? "Loading available periods..." : "Select an auction period"}
                                                        </option>
                                                        {auctionDates.map((slot) => (
                                                            <option key={slot._id} value={slot._id}>
                                                                {slot.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                {errors.auctionDateId && (
                                                    <p className="text-red-500 text-sm mt-1">{errors.auctionDateId.message}</p>
                                                )}

                                                {selectedAuctionDate && (
                                                    <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                                                        <p className="text-blue-800">
                                                            <strong>Starts:</strong>{" "}
                                                            {new Date(selectedAuctionDate.startDate).toLocaleString("en-IE")}
                                                        </p>
                                                        <p className="text-blue-800">
                                                            <strong>Ends:</strong>{" "}
                                                            {new Date(selectedAuctionDate.endDate).toLocaleString("en-IE")}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            // buy_now / giveaway keep the existing date inputs — unchanged
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                                <div>
                                                    <label htmlFor="startDate" className="block text-sm font-medium text-secondary mb-1">
                                                        Start Date & Time *
                                                    </label>
                                                    <div className="relative">
                                                        <Clock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                                        <input
                                                            {...register('startDate', { required: 'Start date is required' })}
                                                            id="startDate"
                                                            type="datetime-local"
                                                            className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                        />
                                                    </div>
                                                    {errors.startDate && <p className="text-red-500 text-sm mt-1">{errors.startDate.message}</p>}
                                                </div>

                                                <div>
                                                    <label htmlFor="endDate" className="block text-sm font-medium text-secondary mb-1">
                                                        End Date & Time *
                                                    </label>
                                                    <div className="relative">
                                                        <Clock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                                        <input
                                                            {...register('endDate', {
                                                                required: 'End date is required',
                                                                validate: {
                                                                    afterStartDate: value => {
                                                                        const start = new Date(watch('startDate'));
                                                                        const end = new Date(value);
                                                                        return end > start || 'End date must be after start date';
                                                                    }
                                                                }
                                                            })}
                                                            id="endDate"
                                                            type="datetime-local"
                                                            className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                        />
                                                    </div>
                                                    {errors.endDate && <p className="text-red-500 text-sm mt-1">{errors.endDate.message}</p>}
                                                </div>
                                            </div>
                                        )}

                                        <div className="mb-6">
                                            <label htmlFor="photo-upload" className="block text-sm font-medium text-secondary mb-1">
                                                Attach Photos *
                                            </label>
                                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                                                <input
                                                    type="file"
                                                    multiple
                                                    accept="image/*"
                                                    onChange={handlePhotoUpload}
                                                    className="hidden"
                                                    id="photo-upload"
                                                />
                                                <label htmlFor="photo-upload" className="cursor-pointer">
                                                    <Image size={40} className="mx-auto text-gray-400 mb-2" />
                                                    <p className="text-gray-600">
                                                        {isCompressing ? 'Optimising images…' : 'Browse photo(s) to upload'}
                                                    </p>
                                                    <p className="text-sm text-secondary">
                                                        Recommended: exterior, interior, engine, undercarriage
                                                    </p>
                                                </label>
                                            </div>
                                            {errors.photos && <p className="text-red-500 text-sm mt-1">{errors.photos.message}</p>}

                                            {uploadedPhotos.length > 0 && (
                                                <PhotoGallery
                                                    photos={uploadedPhotos}
                                                    movePhoto={movePhoto}
                                                    removePhoto={removePhoto}
                                                />
                                            )}
                                        </div>

                                        {/* <div className="mb-6">
                                            <label htmlFor="document-upload" className="block text-sm font-medium text-secondary mb-1">
                                                Attach Documents
                                            </label>
                                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                                                <input
                                                    type="file"
                                                    multiple
                                                    onChange={handleDocumentUpload}
                                                    className="hidden"
                                                    id="document-upload"
                                                />
                                                <label htmlFor="document-upload" className="cursor-pointer">
                                                    <File size={40} className="mx-auto text-gray-400 mb-2" />
                                                    <p className="text-gray-600">Browse document(s) to upload</p>
                                                    <p className="text-sm text-secondary">Title, registration, maintenance records, ownership docs</p>
                                                </label>
                                            </div>

                                            {uploadedDocuments.length > 0 && (
                                                <div className="mt-4 space-y-2">
                                                    {uploadedDocuments.map((doc, index) => (
                                                        <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                                                            <span className="text-sm truncate">{doc.name}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeDocument(index)}
                                                                className="text-red-500"
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="mb-6">
                                            <label htmlFor="service-upload" className="block text-sm font-medium text-secondary mb-1">
                                                Other Images
                                            </label>
                                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                                                <input
                                                    type="file"
                                                    multiple
                                                    accept="image/*"
                                                    onChange={handleServiceRecordUpload}
                                                    className="hidden"
                                                    id="service-upload"
                                                />
                                                <label htmlFor="service-upload" className="cursor-pointer">
                                                    <FileText size={40} className="mx-auto text-gray-400 mb-2" />
                                                    <p className="text-gray-600">Browse other image(s) to upload</p>
                                                    <p className="text-sm text-secondary">Service invoices, maintenance records, repair receipts</p>
                                                </label>
                                            </div>

                                            {uploadedServiceRecords.length > 0 && (
                                                <ServiceHistoryGallery
                                                    serviceRecords={uploadedServiceRecords}
                                                    moveServiceRecord={moveServiceRecord}
                                                    removeServiceRecord={removeServiceRecord}
                                                />
                                            )}
                                        </div> */}
                                    </div>
                                )}

                                {/* Step 2: Pricing & Bidding */}
                                {step === 2 && (
                                    <div>
                                        <h2 className="text-xl font-semibold mb-6 flex items-center">
                                            <Banknote size={20} className="mr-2" />
                                            Pricing & Bidding
                                        </h2>

                                        <p className='mb-2 text-gray-500 text-xs'>Note: Your saved currency {user?.currency === 'GBP' ? 'Pound Sterling' : 'Euro'} ({user?.currency}) will be used for prices. You can change it from <Link to={`/${user?.userType}/profile`} className='underline font-medium'>profile settings</Link>.</p>

                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-secondary mb-1">Auction Type *</label>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                {[
                                                    { value: 'reserve', label: 'Reserve Auction' },
                                                    { value: 'standard', label: 'No Reserve Auction' },
                                                    // { value: 'buy_now', label: 'Buy Now Auction' },
                                                    { value: 'giveaway', label: 'Free Giveaway' },
                                                ].map((type) => (
                                                    <label key={type.value} className="flex items-center p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                                                        <input
                                                            type="radio"
                                                            {...register('auctionType', { required: 'Auction type is required' })}
                                                            value={type.value}
                                                            className="mr-3"
                                                        />
                                                        <span>{type.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            {errors.auctionType && <p className="text-red-500 text-sm mt-1">{errors.auctionType.message}</p>}
                                        </div>

                                        {/* Show immediate start message for buy_now and giveaway */}
                                        {(watch('auctionType') === 'buy_now' || watch('auctionType') === 'giveaway') && (
                                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                                                <p className="text-green-700 flex items-center gap-2">
                                                    <Zap size={18} />
                                                    <span>This ad type will not require bidding. Anyone can participate as soon as it's created.</span>
                                                </p>
                                            </div>
                                        )}

                                        {/* Only show pricing fields if NOT giveaway */}
                                        {watch('auctionType') !== 'giveaway' && (
                                            <>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                                    {(watch('auctionType') === 'standard' || watch('auctionType') === 'reserve') && (
                                                        <div>
                                                            <label htmlFor="startPrice" className="block text-sm font-medium text-secondary mb-1">Start Price *</label>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600">{user?.currency === 'GBP' ? '£' : '€'}</span>
                                                                <input
                                                                    {...register('startPrice', {
                                                                        required: watch('auctionType') !== 'giveaway' ? 'Start price is required' : false,
                                                                        min: { value: 0, message: 'Price must be positive' }
                                                                    })}
                                                                    id="startPrice"
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    className="w-full pl-8 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                                    placeholder="0.00"
                                                                />
                                                            </div>
                                                            {errors.startPrice && <p className="text-red-500 text-sm mt-1">{errors.startPrice.message}</p>}
                                                        </div>)}

                                                    {(watch('auctionType') === 'standard' || watch('auctionType') === 'reserve') && (
                                                        <div>
                                                            <label htmlFor="bidIncrement" className="block text-sm font-medium text-secondary mb-1">Bid Increment *</label>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600">{user?.currency === 'GBP' ? '£' : '€'}</span>
                                                                <input
                                                                    {...register('bidIncrement', {
                                                                        required: (watch('auctionType') === 'standard' || watch('auctionType') === 'reserve') ? 'Bid increment is required' : false,
                                                                        min: { value: 0, message: 'Increment must be positive' }
                                                                    })}
                                                                    id="bidIncrement"
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    className="w-full pl-8 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                                    placeholder="0.00"
                                                                />
                                                            </div>
                                                            {errors.bidIncrement && <p className="text-red-500 text-sm mt-1">{errors.bidIncrement.message}</p>}
                                                        </div>
                                                    )}
                                                </div>

                                                {watch('auctionType') === 'reserve' && (
                                                    <div className="mb-6">
                                                        <label htmlFor="reservePrice" className="block text-sm font-medium text-secondary mb-1">Reserve Price *</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600">{user?.currency === 'GBP' ? '£' : '€'}</span>
                                                            <input
                                                                {...register('reservePrice', {
                                                                    required: watch('auctionType') === 'reserve' ? 'Reserve price is required' : false,
                                                                    min: { value: 0, message: 'Price must be positive' },
                                                                    validate: value => {
                                                                        const startPrice = parseFloat(watch('startPrice') || 0);
                                                                        const reservePrice = parseFloat(value);
                                                                        return reservePrice >= startPrice || 'Reserve price must be greater than or equal to start price';
                                                                    }
                                                                })}
                                                                id="reservePrice"
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                className="w-full pl-8 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                                placeholder="0.00"
                                                            />
                                                        </div>
                                                        {errors.reservePrice && <p className="text-red-500 text-sm mt-1">{errors.reservePrice.message}</p>}
                                                        <p className="text-sm text-secondary mt-1">Item will not sell if bids don't reach this price</p>
                                                    </div>
                                                )}

                                                {watch('auctionType') === 'buy_now' && (
                                                    <div className="mb-4">
                                                        <label htmlFor="buyNowPrice" className="block text-sm font-medium text-secondary mb-1">
                                                            Buy Now Price *
                                                        </label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600">{user?.currency === 'GBP' ? '£' : '€'}</span>
                                                            <input
                                                                {...register('buyNowPrice', {
                                                                    required: watch('auctionType') === 'buy_now' ? 'Buy Now price is required' : false,
                                                                    min: { value: 0, message: 'Price must be positive' },
                                                                    validate: value => {
                                                                        const startPrice = parseFloat(watch('startPrice') || 0);
                                                                        const buyNowPrice = parseFloat(value);
                                                                        return buyNowPrice >= startPrice || 'Buy Now price must be greater than or equal to start price';
                                                                    }
                                                                })}
                                                                id="buyNowPrice"
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                className="w-full pl-8 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                                placeholder="0.00"
                                                            />
                                                        </div>
                                                        {errors.buyNowPrice && <p className="text-red-500 text-sm mt-1">{errors.buyNowPrice.message}</p>}
                                                        <p className="text-sm text-secondary mt-1">
                                                            Buyers can purchase immediately at this price, ending the auction
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Payment Collection Preference */}
                                                {/* <div className="mb-6">
                                                    <label htmlFor="paymentCollectionPreference" className="block text-sm font-medium text-secondary mb-1">
                                                        Payment Collection Method *
                                                    </label>
                                                    <select
                                                        {...register('paymentCollectionPreference', {
                                                            required: 'Please select a payment collection method'
                                                        })}
                                                        id="paymentCollectionPreference"
                                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                    >
                                                        <option value="buyer_decides">Buyer Decides</option>
                                                        <option value="bank_transfer">Bank Transfer</option>
                                                        <option value="credit_card">Credit Card</option>
                                                    </select>
                                                    {errors.paymentCollectionPreference && (
                                                        <p className="text-red-500 text-sm mt-1">{errors.paymentCollectionPreference.message}</p>
                                                    )}
                                                    <p className="text-sm text-secondary mt-1">
                                                        Choose how you prefer to collect payment from the winning buyer
                                                    </p>
                                                </div> */}

                                                {/* Allow Offers Toggle */}
                                                {/* <div className="mb-6">
                                                    <label className="flex items-center cursor-pointer">
                                                        <div className="relative">
                                                            <input
                                                                type="checkbox"
                                                                {...register('allowOffers')}
                                                                id="allowOffers"
                                                                className="sr-only"
                                                            />
                                                            <div className={`block w-14 h-8 rounded-full ${watch('allowOffers') ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                                            <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition ${watch('allowOffers') ? 'transform translate-x-6' : ''}`}></div>
                                                        </div>
                                                        <div className="ml-3">
                                                            <span className="font-medium text-secondary">Allow Offers</span>
                                                            <p className="text-sm text-secondary mt-1">
                                                                Enable buyers to make purchase offers during the auction
                                                            </p>
                                                        </div>
                                                    </label>
                                                </div> */}

                                                {/* VAT Applicable Checkbox */}
                                                <div className="mb-6">
                                                    <label className="flex items-center cursor-pointer">
                                                        <div className="relative">
                                                            <input
                                                                type="checkbox"
                                                                {...register('vatIncluded')}
                                                                id="vatIncluded"
                                                                className="sr-only"
                                                                // Remove the 'value' attribute and use proper boolean
                                                                checked={!!watch('vatIncluded')}
                                                                onChange={(e) => {
                                                                    const checked = e.target.checked;
                                                                    setValue('vatIncluded', checked);
                                                                    trigger('vatIncluded');
                                                                }}
                                                            />
                                                            <div className={`block w-14 h-8 rounded-full ${watch('vatIncluded') ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                                            <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition ${watch('vatIncluded') ? 'transform translate-x-6' : ''}`}></div>
                                                        </div>
                                                        <div className="ml-3">
                                                            <span className="font-medium text-secondary">VAT Applicable</span>
                                                            <p className="text-sm text-secondary mt-1">
                                                                Check this box if VAT will be charged on this item
                                                            </p>
                                                        </div>
                                                    </label>
                                                </div>

                                                <div className='mb-6 text-sm text-gray-600 flex flex-start md:items-center gap-2'>
                                                    <Info size={24} className='flex-shrink-0' />
                                                    <p>RexBid handles the payments between buyer and seller, if your sale is successful, you will be paid by Bank Transfer through Stripe Payment Services. There is currently no seller commission fee to sell with RexBid.</p>
                                                </div>
                                            </>
                                        )}

                                        {/* Show giveaway info */}
                                        {/* {watch('auctionType') === 'giveaway' && (
                                            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-6">
                                                <h3 className="text-lg font-semibold text-green-700 mb-2 flex items-center gap-2">
                                                    <span>🎁 Giveaway</span>
                                                </h3>
                                                <p className="text-green-600 mb-2">
                                                    This item will be given away for free. The first user who clicks "Claim" will win it immediately.
                                                </p>
                                                <p className="text-sm text-green-500">
                                                    No pricing needed. The auction will end as soon as someone claims it.
                                                </p>
                                            </div>
                                        )} */}
                                    </div>
                                )}

                                {/* Step 3: Seller Listing Terms */}
                                {step === 3 && (
                                    <div>
                                        <h2 className="text-xl font-semibold mb-2 flex items-center">
                                            <FileText size={20} className="mr-2" />
                                            Seller Listing Terms
                                        </h2>

                                        <p className="text-sm text-secondary mb-6">
                                            Please read and accept these conditions before listing an item on RexBid.
                                        </p>

                                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 sm:p-6 mb-6 max-h-full overflow-y-auto space-y-6 text-sm text-gray-700 leading-relaxed">
                                            {/* 1 */}
                                            <div>
                                                <h3 className="font-semibold text-gray-900 mb-2">1. Exclusive listing on RexBid</h3>
                                                <p>
                                                    List exclusively on RexBid. Keep the item available for the full listing period. Selling elsewhere,
                                                    privately, withdrawing without approval or refusing to complete will result in a seller-default charge.
                                                </p>
                                            </div>

                                            {/* 2 */}
                                            <div>
                                                <h3 className="font-semibold text-gray-900 mb-2">2. Honour the winning bid</h3>
                                                <p>
                                                    If the reserve is met and there is a winning bidder, complete the sale at the winning price.
                                                </p>
                                            </div>

                                            {/* 3 */}
                                            <div>
                                                <h3 className="font-semibold text-gray-900 mb-2">3. Wait for collection clearance</h3>
                                                <p>
                                                    The buyer pays through RexBid. Keep the item secure and in the condition described until RexBid
                                                    confirms cleared funds and authorises handover.
                                                </p>
                                            </div>

                                            {/* 4 */}
                                            <div>
                                                <h3 className="font-semibold text-gray-900 mb-2">4. Confirm handover to get paid</h3>
                                                <p>
                                                    RexBid releases your net proceeds after both parties confirm collection or delivery.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mb-6">
                                            <label htmlFor="termsAgreed" className="flex items-start">
                                                <input
                                                    type="checkbox"
                                                    {...register('termsAgreed', { required: 'You must agree to the terms' })}
                                                    id="termsAgreed"
                                                    className="mt-1 mr-2"
                                                />
                                                <span className="text-sm font-medium text-secondary">
                                                    I confirm that I own, or am authorised to sell, this item. I agree not to withdraw or sell it
                                                    elsewhere while it is live on RexBid. I understand that valid bids are binding, that I must
                                                    complete a successful sale, and that RexBid will release payment only after collection or
                                                    delivery is confirmed in accordance with these terms.
                                                </span>
                                            </label>
                                            {errors.termsAgreed && (
                                                <p className="text-red-500 text-sm mt-1">{errors.termsAgreed.message}</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Navigation Buttons */}
                                <div className="flex justify-between mt-8">
                                    {step > 1 ? (
                                        <button
                                            type="button"
                                            onClick={prevStep}
                                            className="flex items-center px-6 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                                        >
                                            <ArrowLeft size={18} className="mr-2" />
                                            Previous
                                        </button>
                                    ) : (
                                        <div></div>
                                    )}

                                    {step < 3 ? (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                nextStep();
                                            }}
                                            disabled={isCompressing}
                                            className="flex items-center px-6 py-2 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 text-white hover:from-orange-500 hover:via-orange-600 hover:to-orange-700 rounded-lg transition-colors"
                                        >
                                            Next
                                            <ArrowRight size={18} className="ml-2" />
                                        </button>
                                    ) : (
                                        <button
                                            type="submit"
                                            className="flex items-center px-6 py-2 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 text-white hover:from-orange-500 hover:via-orange-600 hover:to-orange-700 rounded-lg transition-colors"
                                        >
                                            <Gavel size={18} className="mr-2" />
                                            {isLoading ? 'Creating Auction...' : 'Create Auction'}
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    </AdminContainer>
                </div>
            </section>
        </DndProvider>
    );
};

export default CreateAuction;