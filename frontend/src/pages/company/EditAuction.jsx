import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import parse from 'html-react-parser';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import {
    FileText,
    Banknote,
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
    Plane,
    Cog,
    Trophy,
    Move,
    Car,
    Calendar,
    AlertCircle,
    Zap,
    Info
} from "lucide-react";
import { RTE, CompanyContainer, CompanyHeader, CompanySidebar } from '../../components';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import axiosInstance from '../../utils/axiosInstance';
import { useAuth } from '../../contexts/AuthContext';
import { compressAuctionImages } from '../../utils/compressImage.js';
import { TouchBackend } from 'react-dnd-touch-backend';
import { validateMinStart, validateMinReserve, minimumsHint } from '../../utils/listingRules';
import { minLivePrice, CLOSE_CUTOFF_HOURS } from '../../utils/liveBuyNow';

// Drag and Drop item types
const ItemTypes = {
    PHOTO: 'photo',
};

// Fixed Draggable Photo Component
const DraggablePhoto = ({
    photo,
    index,
    movePhoto,
    removePhoto,
    caption,
    onCaptionChange
}) => {
    const ref = useRef(null);

    const imageSrc = photo.isExisting
        ? photo.url
        : photo.previewUrl;

    const [{ isDragging }, drag] = useDrag(() => ({
        type: ItemTypes.PHOTO,
        item: {
            id: photo.id,
            index,
        },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    }), [photo.id, index]);

    const [, drop] = useDrop(() => ({
        accept: ItemTypes.PHOTO,

        hover(item) {
            if (!ref.current) return;
            if (item.id === photo.id) return;
            if (item.index === index) return;

            movePhoto(item.index, index);

            // Update the dragged photo's current index.
            item.index = index;
        },
    }), [photo.id, index, movePhoto]);

    drag(drop(ref));

    return (
        <div className="space-y-2">
            <div
                ref={ref}
                style={{
                    opacity: isDragging ? 0.85 : 1,
                    cursor: isDragging ? 'grabbing' : 'grab',
                }}
                className="relative group select-none"
            >
                <img
                    src={imageSrc}
                    alt={`Photo ${index + 1}`}
                    draggable={false}
                    className="w-full h-32 object-cover rounded-lg border-2 border-transparent hover:border-blue-500 pointer-events-none"
                />

                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 rounded-lg flex items-center justify-center pointer-events-none">
                    <Move
                        size={20}
                        className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    />
                </div>

                <div className="absolute top-2 left-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded-full pointer-events-none">
                    {index + 1}
                </div>

                <div className="absolute top-2 right-2 bg-blue-500 bg-opacity-70 text-white text-xs px-2 py-1 rounded-full pointer-events-none">
                    {photo.isExisting ? 'Existing' : 'New'}
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
        </div>
    );
};


// Photo Gallery Component
const PhotoGallery = ({ photos, movePhoto, removePhoto, captions, onCaptionChange }) => {
    return (
        <div className="mt-4">
            <p className="text-sm text-secondary mb-3">
                Drag and drop to reorder photos. The first image will be the main thumbnail.
                <span className="block text-xs text-gray-500 mt-1">
                    Blue badge indicates existing photos
                </span>
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {photos.map((photo, index) => (
                    <DraggablePhoto
                        key={photo.id}
                        photo={photo}
                        index={index}
                        movePhoto={movePhoto}
                        removePhoto={removePhoto}
                        caption={captions[index] || ''} // Add this
                        onCaptionChange={onCaptionChange} // Add this
                    />
                ))}
            </div>
        </div>
    );
};

// document gallery component
const DocumentGallery = ({ existingDocs, newDocs, removeDoc, existingCaptions, newCaptions, onCaptionChange }) => {
    return (
        <div className="space-y-4">
            {/* Existing documents */}
            {existingDocs.length > 0 && (
                <div>
                    <p className="text-sm text-secondary mb-2">Existing Documents:</p>
                    <div className="space-y-2">
                        {existingDocs.map((doc, index) => (
                            <div key={`existing-doc-${index}`} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                                {/* <div className="flex-1">
                                    <span className="text-sm truncate">{doc.filename || doc.originalName}</span>
                                    <input
                                        type="text"
                                        placeholder="Add caption..."
                                        value={existingCaptions[index] || ''}
                                        onChange={(e) => onCaptionChange('existing', index, e.target.value)}
                                        className="w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-black"
                                    />
                                </div> */}
                                <button
                                    type="button"
                                    onClick={() => removeDoc(index, true)}
                                    className="text-red-500 ml-2"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* New documents */}
            {newDocs.length > 0 && (
                <div>
                    <p className="text-sm text-secondary mb-2">New Documents:</p>
                    <div className="space-y-2">
                        {newDocs.map((doc, index) => (
                            <div key={`new-doc-${index}`} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                                {/* <div className="flex-1">
                                    <span className="text-sm truncate">{doc.name}</span>
                                    <input
                                        type="text"
                                        placeholder="Add caption..."
                                        value={newCaptions[index] || ''}
                                        onChange={(e) => onCaptionChange('new', index, e.target.value)}
                                        className="w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-black"
                                    />
                                </div> */}
                                <button
                                    type="button"
                                    onClick={() => removeDoc(index, false)}
                                    className="text-red-500 ml-2"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// components/UploadProgressModal.jsx
const UploadProgressModal = ({ isOpen, fileCount, isEdit = false }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4">
                <div className="flex items-center mb-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
                    <h3 className="text-lg font-semibold">
                        {isEdit ? 'Updating Your Auction' : 'Creating Your Auction'}
                    </h3>
                </div>

                <div className="space-y-3">
                    <p className="text-gray-600">
                        {fileCount > 0
                            ? `We're uploading ${fileCount} file(s) to our secure cloud storage.`
                            : 'We\'re updating your auction details.'
                        }
                    </p>

                    {fileCount > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <p className="text-sm text-yellow-800">
                                ⏳ <strong>Please be patient:</strong> Large files may take several minutes to upload depending on your internet speed.
                            </p>
                        </div>
                    )}

                    <p className="text-xs text-gray-500 text-center">
                        Do not close this window until the process is complete.
                    </p>
                </div>
            </div>
        </div>
    );
};

// Dynamic Field Renderer Component - Copy this from your CreateAuction page
const DynamicField = ({ field, register, errors, watch, setValue }) => {
    const fieldName = `specifications.${field.name}`;
    const error = errors.specifications?.[field.name];

    const fieldLabel = field.label || field.name || 'Field';
    const fieldPlaceholder = field.placeholder || `Enter ${fieldLabel.toLowerCase()}`;

    const inputClasses = `w-full p-3 border ${error ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-black focus:border-transparent`;
    const unitText = field.unit ? ` (${field.unit})` : '';

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

const EditAuction = () => {
    const [step, setStep] = useState(1);
    const [allPhotos, setAllPhotos] = useState([]); // Unified photo array
    const allPhotosRef = useRef([]);
    const [uploadedDocuments, setUploadedDocuments] = useState([]);
    const [existingDocuments, setExistingDocuments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [initialSpecifications, setInitialSpecifications] = useState({});
    const [removedPhotos, setRemovedPhotos] = useState([]);
    const [removedDocuments, setRemovedDocuments] = useState([]);
    const [existingServiceRecords, setExistingServiceRecords] = useState([]);
    const [uploadedServiceRecords, setUploadedServiceRecords] = useState([]);
    const [removedServiceRecords, setRemovedServiceRecords] = useState([]);
    const [allServiceRecords, setAllServiceRecords] = useState([]);
    const [categories, setCategories] = useState([]);
    // Category state - Add these
    const [parentCategories, setParentCategories] = useState([]);
    const [subCategories, setSubCategories] = useState([]);
    const [selectedParent, setSelectedParent] = useState(null);
    const [categoryFields, setCategoryFields] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [loadingFields, setLoadingFields] = useState(false);

    // Calculate if there are new files to upload
    const newPhotos = allPhotos.filter(photo => !photo.isExisting);
    const hasNewUploads = newPhotos.length > 0 || uploadedDocuments.length > 0;
    const totalNewFiles = newPhotos.length + uploadedDocuments.length;

    // caption states
    const [photoCaptions, setPhotoCaptions] = useState([]);
    const [documentCaptions, setDocumentCaptions] = useState([]);
    const [serviceRecordCaptions, setServiceRecordCaptions] = useState([]);
    const [uploadedDocumentCaptions, setUploadedDocumentCaptions] = useState([]);

    const [isCompressing, setIsCompressing] = useState(false);

    const { auctionId } = useParams();
    const navigate = useNavigate();

    const { user } = useAuth();
    const userCurrency = user?.currency || 'EUR';

    const [baseCurrency, setBaseCurrency] = useState(userCurrency || 'EUR');
    const [auction, setAuction] = useState(null);

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        setError,
        clearErrors,
        trigger,
        getValues,
        control,
        reset,
        formState: { errors }
    } = useForm({
        mode: 'onChange',
        defaultValues: {
            auctionType: 'buy_now',
            endDate: '',
            paymentCollectionPreference: 'credit_card',
            vatIncluded: false
        }
    });

    const auctionType = watch('auctionType');
    const startDate = watch('startDate');
    const endDate = watch('endDate');
    const selectedCategory = watch('category');

    const [auctionDates, setAuctionDates] = useState([]);
    const [loadingDates, setLoadingDates] = useState(false);
    const [originalAuctionStatus, setOriginalAuctionStatus] = useState(null);

    const selectedAuctionDateId = watch('auctionDateId');
    const selectedAuctionDate = auctionDates.find(
        (s) => s._id === selectedAuctionDateId,
    );

    const isTimedAuction =
        auctionType === 'standard' || auctionType === 'reserve';

    // Slot can only be changed while the auction is draft
    const canChangeSlot = originalAuctionStatus === 'draft';

    useEffect(() => {
        const fetchDates = async () => {
            try {
                setLoadingDates(true);
                const { data } = await axiosInstance.get('/api/v1/auction-dates/active');
                if (data.success) setAuctionDates(data.data.auctionDates);
            } catch (err) {
                console.error('Failed to load auction dates', err);
            } finally {
                setLoadingDates(false);
            }
        };
        fetchDates();
    }, []);

    useEffect(() => {
        allPhotosRef.current = allPhotos;
    }, [allPhotos]);

    useEffect(() => {
        return () => {
            allPhotosRef.current.forEach(photo => {
                if (
                    !photo.isExisting &&
                    photo.previewUrl?.startsWith('blob:')
                ) {
                    URL.revokeObjectURL(photo.previewUrl);
                }
            });
        };
    }, []);

    useEffect(() => {
        if (auctionType !== 'standard' && auctionType !== 'reserve') {
            setValue('auctionDateId', '');
        }
    }, [auctionType, setValue]);

    // Fetch parent categories
    const fetchParentCategories = async () => {
        try {
            setLoadingCategories(true);
            const { data } = await axiosInstance.get('/api/v1/categories/public/parents');
            if (data.success) {
                setParentCategories(data.data);
            }
        } catch (error) {
            console.error('Error fetching parent categories:', error);
        } finally {
            setLoadingCategories(false);
        }
    };

    // Fetch subcategories
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
            setSubCategories([]);
        } finally {
            setLoadingCategories(false);
        }
    };

    // Fetch category fields
    const fetchCategoryFields = async (slug) => {
        try {
            setLoadingFields(true);
            const { data } = await axiosInstance.get(`/api/v1/categories/public/by-slug/${slug}/fields`);
            if (data.success) {
                setCategoryFields(data.data.fields || []);
            }
        } catch (error) {
            console.error('Error fetching category fields:', error);
            setCategoryFields([]);
        } finally {
            setLoadingFields(false);
        }
    };

    // Fetch parent categories on mount
    useEffect(() => {
        fetchParentCategories();
    }, []);

    // Get category-specific fields
    const getCategoryFields = () => {
        return categoryFields['ALL'] || [];
    };

    // Static categories fallback (optional)
    const getStaticCategories = () => [
        { name: 'Sports', slug: 'sports' },
        { name: 'Convertible', slug: 'convertible' },
        { name: 'Electric', slug: 'electric' },
        { name: 'Hatchback', slug: 'hatchback' },
        { name: 'Sedan', slug: 'sedan' },
        { name: 'SUV', slug: 'suv' },
        { name: 'Classic', slug: 'classic' },
        { name: 'Luxury', slug: 'luxury' },
        { name: 'Muscle', slug: 'muscle' },
        { name: 'Off-Road', slug: 'off-road' },
        { name: 'Truck', slug: 'truck' },
        { name: 'Van', slug: 'van' },
    ];

    const movePhoto = useCallback((dragIndex, dropIndex) => {
        if (dragIndex === dropIndex) return;

        setAllPhotos(prevPhotos => {
            if (
                dragIndex < 0 ||
                dropIndex < 0 ||
                dragIndex >= prevPhotos.length ||
                dropIndex >= prevPhotos.length
            ) {
                return prevPhotos;
            }

            const updatedPhotos = [...prevPhotos];

            const [movedPhoto] = updatedPhotos.splice(dragIndex, 1);

            updatedPhotos.splice(dropIndex, 0, movedPhoto);

            return updatedPhotos;
        });

        setPhotoCaptions(prevCaptions => {
            const updatedCaptions = [...prevCaptions];

            if (
                dragIndex < 0 ||
                dropIndex < 0 ||
                dragIndex >= updatedCaptions.length ||
                dropIndex >= updatedCaptions.length
            ) {
                return prevCaptions;
            }

            const [movedCaption] = updatedCaptions.splice(dragIndex, 1);

            updatedCaptions.splice(dropIndex, 0, movedCaption);

            return updatedCaptions;
        });
    }, []);

    const moveServiceRecord = useCallback((dragIndex, hoverIndex) => {
        setAllServiceRecords(prevServiceRecords => {
            const updatedServiceRecords = [...prevServiceRecords];
            const [movedServiceRecord] = updatedServiceRecords.splice(dragIndex, 1);
            updatedServiceRecords.splice(hoverIndex, 0, movedServiceRecord);
            return updatedServiceRecords;
        });

        // Also move corresponding captions
        setServiceRecordCaptions(prevCaptions => {
            const updatedCaptions = [...prevCaptions];
            const [movedCaption] = updatedCaptions.splice(dragIndex, 1);
            updatedCaptions.splice(hoverIndex, 0, movedCaption);
            return updatedCaptions;
        });
    }, []);

    const formatDateForInput = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return localDate.toISOString().slice(0, 16);
    };

    const mapToObject = (map) => {
        if (!map) return {};
        if (map instanceof Map) {
            const obj = {};
            map.forEach((value, key) => {
                obj[key] = value;
            });
            return obj;
        }
        return map;
    };

    // Fetch auction data
    useEffect(() => {
        const fetchAuctionData = async () => {
            try {
                setIsLoading(true);
                const { data } = await axiosInstance.get(`/api/v1/auctions/${auctionId}?currency=${userCurrency}`);

                if (data.success) {
                    const auction = data.data.auction;
                    setAuction(auction);
                    setBaseCurrency(auction?.baseCurrency);
                    const specificationsObj = mapToObject(auction.specifications);
                    setInitialSpecifications(specificationsObj);

                    // Handle categories - extract parent and subcategory
                    const categories = auction.categories || [];
                    let parentSlug = null;
                    let subCategorySlug = null;

                    // Since we always store [parentSlug, subCategorySlug] in that order
                    if (categories.length >= 2) {
                        // First is parent, second is subcategory
                        parentSlug = categories[0];
                        subCategorySlug = categories[1];
                    } else if (categories.length === 1) {
                        // If only one category, it's the subcategory
                        subCategorySlug = categories[0];
                        // We need to find its parent
                        try {
                            const fieldsRes = await axiosInstance.get(`/api/v1/categories/public/by-slug/${subCategorySlug}/fields`);
                            if (fieldsRes.data.success && fieldsRes.data.data.category) {
                                const categoryData = fieldsRes.data.data.category;
                                if (categoryData.level === 1 && categoryData.parentCategory) {
                                    parentSlug = categoryData.parentCategory.slug;
                                }
                            }
                        } catch (e) {
                            console.error('Error fetching parent info:', e);
                        }
                    }

                    // Set the form values
                    setValue('parentCategory', parentSlug || '');
                    setValue('category', subCategorySlug || '');

                    // If parent category exists, fetch its subcategories
                    if (parentSlug) {
                        await fetchSubCategories(parentSlug);
                    }

                    // If subcategory exists, fetch its fields
                    if (subCategorySlug) {
                        await fetchCategoryFields(subCategorySlug);
                    }

                    // Set basic fields
                    const formData = {
                        title: auction.title,
                        parentCategory: parentSlug || '',
                        category: subCategorySlug || '',
                        features: auction.features || '',
                        description: auction.description,
                        location: auction.location,
                        video: auction.videoLink,
                        startDate: formatDateForInput(auction.startDate),
                        endDate: formatDateForInput(auction.endDate),
                        startPrice: auction.startPrice,
                        bidIncrement: auction.bidIncrement,
                        auctionType: auction.auctionType,
                        reservePrice: auction.reservePrice,
                        liveBuyNowPrice: auction.liveBuyNow?.price || '',
                        buyNowPrice: auction.buyNowPrice,
                        allowOffers: auction.allowOffers,
                        paymentCollectionPreference: auction.paymentCollectionPreference || 'credit_card',
                        vatIncluded: auction.vatIncluded || false
                    };

                    reset(formData);

                    setValue('auctionDateId', auction.auctionDate || '');
                    setOriginalAuctionStatus(auction.status);

                    // If parent category exists, fetch its subcategories
                    if (parentSlug) {
                        await fetchSubCategories(parentSlug);
                    }

                    // If subcategory exists, fetch its fields
                    if (subCategorySlug) {
                        await fetchCategoryFields(subCategorySlug);

                        // Set specification values after fields are loaded
                        setTimeout(() => {
                            Object.entries(specificationsObj).forEach(([key, value]) => {
                                setValue(`specifications.${key}`, value, {
                                    shouldValidate: true,
                                    shouldDirty: false,
                                    shouldTouch: false
                                });
                            });
                        }, 100);
                    }

                    // Initialize photos, documents, service records...
                    const existingPhotosWithFlag = (auction.photos || []).map(photo => ({
                        ...photo,
                        isExisting: true,
                        id: photo.publicId || photo._id,
                        url: photo.url
                    }));
                    setAllPhotos(existingPhotosWithFlag);

                    setExistingDocuments(auction.documents || []);

                    const existingServiceRecordsWithFlag = (auction.serviceRecords || []).map(record => ({
                        ...record,
                        isExisting: true,
                        id: record.publicId || record._id,
                        url: record.url
                    }));
                    setAllServiceRecords(existingServiceRecordsWithFlag);

                    toast.success('Auction data loaded successfully');
                }
            } catch (error) {
                console.error('Error:', error);
                toast.error('Failed to load auction data');
                navigate('/company/auctions/all');
            } finally {
                setIsLoading(false);
            }
        };

        if (auctionId) fetchAuctionData();
    }, [auctionId, reset, setValue, navigate]);

    // Fetch subcategories when parent is selected
    useEffect(() => {
        const parentSlug = watch('parentCategory');
        if (parentSlug) {
            fetchSubCategories(parentSlug);
            // Clear previously selected subcategory
            setValue('category', '');
            setCategoryFields([]);
        }
    }, [watch('parentCategory')]);

    // Fetch fields when subcategory is selected
    useEffect(() => {
        const subCategorySlug = watch('category');
        if (subCategorySlug) {
            fetchCategoryFields(subCategorySlug);
        }
    }, [watch('category')]);

    const nextStep = async () => {
        let isValid = true;

        scrollTo({ top: 0, behavior: 'smooth' });

        if (step === 1) {
            const fieldsToValidate = ['title', 'category', 'description'];

            if (isTimedAuction) {
                // Only require the slot while the user is allowed to change it
                if (canChangeSlot) {
                    fieldsToValidate.push('auctionDateId');
                }
            }

            // Add category-specific fields to validation
            // Add ALL specification fields to validation
            const allSpecFields = getCategoryFields();
            allSpecFields.forEach(field => {
                if (field.required) {
                    fieldsToValidate.push(`specifications.${field.name}`);
                }
            });

            const overallValidationPassed = await trigger(fieldsToValidate);

            if (!overallValidationPassed) {
                isValid = false;
            }

            // Check photos are uploaded or exist
            if (allPhotos.length === 0) {
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
            // Check pricing fields based on auction type
            const fieldsToValidate = ['auctionType'];

            if (auctionType === 'standard' || auctionType === 'reserve') {
                fieldsToValidate.push('startPrice', 'bidIncrement');
            }

            if (auctionType === 'reserve') {
                fieldsToValidate.push('reservePrice', 'liveBuyNowPrice');
            }

            if (auctionType === 'buy_now') {
                fieldsToValidate.push('buyNowPrice');
                // For buy now auctions, startPrice is also required
                fieldsToValidate.push('startPrice');
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
        scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Fixed handlePhotoUpload function
    const handlePhotoUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setIsCompressing(true);
        let compressedFiles = files;

        try {
            compressedFiles = await compressAuctionImages(files);
        } catch (err) {
            console.error('Image processing failed:', err);
            toast.error('Could not process one or more images');
            setIsCompressing(false);
            e.target.value = '';
            return;
        }

        const newPhotos = compressedFiles.map(file => {
            const fileId = `${file.name}-${file.size}-${file.lastModified}`;
            const uniqueId = `new-${Date.now()}-${fileId.replace(/[^a-zA-Z0-9]/g, '-')}`;
            return {
                file,
                isExisting: false,
                id: uniqueId,
                _fileSignature: `${file.name}-${file.size}-${file.lastModified}`
            };
        });

        const existingSignatures = new Set(
            allPhotos
                .filter(photo => !photo.isExisting)
                .map(photo => photo._fileSignature)
        );

        const uniqueNewPhotos = newPhotos.filter(photo =>
            !existingSignatures.has(photo._fileSignature)
        );

        if (uniqueNewPhotos.length === 0) {
            toast.error('Some photos are already added');
            setIsCompressing(false);
            e.target.value = '';
            return;
        }

        // Create preview URLs only once.
        const photosWithPreview = uniqueNewPhotos.map(photo => ({
            ...photo,
            previewUrl: URL.createObjectURL(photo.file),
        }));

        setAllPhotos(prev => [
            ...photosWithPreview,
            ...prev,
        ]);

        // Keep captions aligned with photos.
        setPhotoCaptions(prev => [
            ...photosWithPreview.map(() => ''),
            ...prev,
        ]);

        clearErrors('photos');
        setIsCompressing(false);
        e.target.value = '';
    };

    const handleServiceRecordUpload = async (e) => {
        const files = Array.from(e.target.files);

        if (files.length === 0) return;

        setIsCompressing(true);
        let compressedFiles = files;
        try {
            compressedFiles = await compressAuctionImages(files);
        } catch (err) {
            console.error('Service record compression failed:', err);
            setIsCompressing(false);
            e.target.value = '';
            return;
        }

        const newServiceRecords = compressedFiles.map(file => {
            const fileId = `${file.name}-${file.size}-${file.lastModified}`;
            const uniqueId = `new-servicerecord-${Date.now()}-${fileId.replace(/[^a-zA-Z0-9]/g, '-')}`;

            return {
                file,
                isExisting: false,
                id: uniqueId,
                _fileSignature: `${file.name}-${file.size}-${file.lastModified}`
            };
        });

        const existingSignatures = new Set(
            allServiceRecords
                .filter(serviceRecord => !serviceRecord.isExisting)
                .map(serviceRecord => serviceRecord._fileSignature)
        );

        const uniqueNewServiceRecords = newServiceRecords.filter(serviceRecord =>
            !existingSignatures.has(serviceRecord._fileSignature)
        );

        if (uniqueNewServiceRecords.length === 0) {
            toast.error('Some serviceRecord images are already added');
            return;
        }

        setAllServiceRecords(prev => {
            const existingSignatures = new Set(
                prev.filter(l => !l.isExisting).map(l => l._fileSignature)
            );

            const filteredNewServiceRecords = uniqueNewServiceRecords.filter(serviceRecord =>
                !existingSignatures.has(serviceRecord._fileSignature)
            );

            return [...filteredNewServiceRecords, ...prev];
        });

        setIsCompressing(false);
        e.target.value = '';
    };

    const removeServiceRecord = (index) => {
        const serviceRecordToRemove = allServiceRecords[index];

        if (serviceRecordToRemove.isExisting) {
            setRemovedServiceRecords(prev => [...prev, serviceRecordToRemove.id]);
        }

        setAllServiceRecords(prev => prev.filter((_, i) => i !== index));
    };

    const removePhoto = (index) => {
        const photoToRemove = allPhotos[index];

        if (!photoToRemove) return;

        if (photoToRemove.isExisting) {
            setRemovedPhotos(prev => [
                ...prev,
                photoToRemove.id
            ]);
        }

        // Release preview URL for newly uploaded photos.
        if (
            !photoToRemove.isExisting &&
            photoToRemove.previewUrl?.startsWith('blob:')
        ) {
            URL.revokeObjectURL(photoToRemove.previewUrl);
        }

        setAllPhotos(prev =>
            prev.filter((_, i) => i !== index)
        );

        setPhotoCaptions(prev =>
            prev.filter((_, i) => i !== index)
        );

        if (allPhotos.length === 1) {
            setError('photos', {
                type: 'manual',
                message: 'At least one photo is required'
            });
        }
    };

    const handleDocumentUpload = (e) => {
        const files = Array.from(e.target.files);
        setUploadedDocuments([...uploadedDocuments, ...files]);

        // Initialize captions for new documents
        const newCaptions = [...uploadedDocumentCaptions];
        files.forEach(() => newCaptions.push(''));
        setUploadedDocumentCaptions(newCaptions);
    };

    const removeDocument = (index, isExisting = false) => {
        if (isExisting) {
            const removedDoc = existingDocuments[index];
            setRemovedDocuments(prev => [...prev, removedDoc.publicId || removedDoc._id]);
            setExistingDocuments(existingDocuments.filter((_, i) => i !== index));

            // Remove caption
            const newCaptions = [...documentCaptions];
            newCaptions.splice(index, 1);
            setDocumentCaptions(newCaptions);
        } else {
            setUploadedDocuments(uploadedDocuments.filter((_, i) => i !== index));

            // Remove caption
            const newCaptions = [...uploadedDocumentCaptions];
            newCaptions.splice(index, 1);
            setUploadedDocumentCaptions(newCaptions);
        }
    };

    // Add these handler functions
    const handlePhotoCaptionChange = (index, value) => {
        const newCaptions = [...photoCaptions];
        newCaptions[index] = value;
        setPhotoCaptions(newCaptions);
    };

    // Update the handler to handle both existing and new documents
    const handleDocumentCaptionChange = (type, index, value) => {
        if (type === 'existing') {
            const newCaptions = [...documentCaptions];
            newCaptions[index] = value;
            setDocumentCaptions(newCaptions);
        } else {
            const newCaptions = [...uploadedDocumentCaptions];
            newCaptions[index] = value;
            setUploadedDocumentCaptions(newCaptions);
        }
    };

    const handleServiceRecordCaptionChange = (index, value) => {
        const newCaptions = [...serviceRecordCaptions];
        newCaptions[index] = value;
        setServiceRecordCaptions(newCaptions);
    };

    // Update auction handler with fixed photo handling
    const updateAuctionHandler = async (formData) => {
        try {
            setIsSubmitting(true);

            const formDataToSend = new FormData();

            // Append all text fields
            formDataToSend.append('title', formData.title);

            // Categories handling
            const categoriesToStore = [];
            if (formData.parentCategory) {
                categoriesToStore.push(formData.parentCategory);
            }
            if (formData.category) {
                categoriesToStore.push(formData.category);
            }
            formDataToSend.append('categories', JSON.stringify(categoriesToStore));

            formDataToSend.append('features', formData.features || '');
            formDataToSend.append('description', formData.description);
            formDataToSend.append('location', formData.location || '');
            formDataToSend.append('videoLink', formData.video || '');
            formDataToSend.append('auctionType', formData.auctionType);
            formDataToSend.append('allowOffers', formData.allowOffers || false);
            formDataToSend.append('paymentCollectionPreference', formData.paymentCollectionPreference || 'credit_card');
            formDataToSend.append('vatIncluded', Boolean(formData.vatIncluded));
            formDataToSend.append('startDate', new Date(formData.startDate).toISOString());
            formDataToSend.append('endDate', new Date(formData.endDate).toISOString());

            // Slot for timed auctions
            if (formData.auctionDateId) {
                formDataToSend.append('auctionDateId', formData.auctionDateId);
            }

            // Get specifications from form data
            const currentSpecifications = formData.specifications || {};
            if (currentSpecifications && Object.keys(currentSpecifications).length > 0) {
                formDataToSend.append('specifications', JSON.stringify(currentSpecifications));
            }

            // ===== PRICING HANDLING =====
            if (formData.auctionType === 'giveaway' || formData.auctionType === 'buy_now') {
                // For giveaways and buy now, set startPrice to 0
                formDataToSend.append('startPrice', 0);

                // For buy now, still need to send buyNowPrice
                if (formData.auctionType === 'buy_now' && formData.buyNowPrice) {
                    formDataToSend.append('buyNowPrice', formData.buyNowPrice);
                }

                // Optional bid increment for buy now auctions (if you want to allow both bidding and buy now)
                if (formData.auctionType === 'buy_now' && formData.bidIncrement) {
                    formDataToSend.append('bidIncrement', formData.bidIncrement);
                }
            } else {
                // Regular timed auctions (standard/reserve)
                if (formData.startPrice) {
                    formDataToSend.append('startPrice', formData.startPrice);
                }

                // Bid increment for standard/reserve
                if (formData.auctionType === 'standard' || formData.auctionType === 'reserve') {
                    if (formData.bidIncrement) {
                        formDataToSend.append('bidIncrement', formData.bidIncrement);
                    }
                }

                // Reserve price for reserve auctions
                if (formData.auctionType === 'reserve' && formData.reservePrice) {
                    formDataToSend.append('reservePrice', formData.reservePrice);
                }

                // Buy It Now during the auction (empty removes it)
                if (formData.auctionType === 'reserve') {
                    formDataToSend.append('liveBuyNowPrice', formData.liveBuyNowPrice || '');
                }
            }

            // Add removed photos and documents
            if (removedPhotos.length > 0) {
                formDataToSend.append('removedPhotos', JSON.stringify(removedPhotos));
            }

            if (removedDocuments.length > 0) {
                formDataToSend.append('removedDocuments', JSON.stringify(removedDocuments));
            }

            if (removedServiceRecords.length > 0) {
                formDataToSend.append('removedServiceRecords', JSON.stringify(removedServiceRecords));
            }

            // Send the complete photo order
            const photoOrder = allPhotos.map(photo => ({
                id: photo.id,
                isExisting: photo.isExisting
            }));
            formDataToSend.append('photoOrder', JSON.stringify(photoOrder));

            // Send the complete service record order
            const serviceRecordOrder = allServiceRecords.map(serviceRecord => ({
                id: serviceRecord.id,
                isExisting: serviceRecord.isExisting
            }));
            formDataToSend.append('serviceRecordOrder', JSON.stringify(serviceRecordOrder));

            // 1. SEND CAPTIONS FOR ALL PHOTOS (BOTH EXISTING AND NEW)
            allPhotos.forEach((photo, index) => {
                // Send caption for this photo
                formDataToSend.append('photoCaptions', photoCaptions[index] || '');

                // Only send file if it's a new photo
                if (!photo.isExisting && photo.file) {
                    formDataToSend.append('photos', photo.file);
                }
            });

            // 2. SEND CAPTIONS AND FILES FOR DOCUMENTS
            // Existing documents
            documentCaptions.forEach((caption, index) => {
                formDataToSend.append('existingDocumentCaptions', caption || '');
            });

            // New documents
            uploadedDocuments.forEach((doc, index) => {
                formDataToSend.append('documents', doc);
                formDataToSend.append('newDocumentCaptions', uploadedDocumentCaptions[index] || '');
            });

            // 3. SEND CAPTIONS FOR ALL SERVICE RECORDS (BOTH EXISTING AND NEW)
            allServiceRecords.forEach((record, index) => {
                // Send caption for this service record
                formDataToSend.append('serviceRecordCaptions', serviceRecordCaptions[index] || '');

                // Only send file if it's a new service record
                if (!record.isExisting && record.file) {
                    formDataToSend.append('serviceRecords', record.file);
                }
            });

            // Use company-specific endpoint
            const { data } = await axiosInstance.put(
                `/api/v1/auctions/update/${auctionId}`,
                formDataToSend,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    }
                }
            );

            if (data.success) {
                // Live listings: the changes wait for RexBid's approval and the
                // listing stays up as it is (backend services/listingEditService.js).
                toast.success(data.message || 'Listing updated', { duration: data.pendingApproval ? 9000 : 5000 });
                navigate('/company/dashboard');
            } else {
                throw new Error(data.message || 'Failed to update auction');
            }
        } catch (error) {
            console.error('Error updating auction:', error);
            const errorMessage = error?.response?.data?.message || 'Failed to update auction';
            toast.error(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <section className="flex min-h-screen bg-gray-50">
                <CompanySidebar />
                <div className="w-full relative">
                    <CompanyHeader />
                    <CompanyContainer>
                        <div className="pt-16 md:py-7 flex justify-center items-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
                        </div>
                    </CompanyContainer>
                </div>
            </section>
        );
    }

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
            <section className="flex min-h-screen bg-gray-50">
                <CompanySidebar />

                <UploadProgressModal
                    isOpen={isSubmitting && hasNewUploads}
                    fileCount={totalNewFiles}
                    isEdit={true}
                />

                <div className="w-full relative">
                    <CompanyHeader />

                    <CompanyContainer>
                        <div className="pt-16 md:py-7">
                            <div className="flex items-center gap-3 mb-5">
                                <button
                                    onClick={() => navigate('/company/auctions/all')}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <ArrowLeft size={20} />
                                </button>
                                <h1 className="text-3xl md:text-4xl font-bold">Edit Listing</h1>
                                {auction && ['active', 'approved'].includes(auction.status) && (
                                    <div className="mt-4 rounded-lg bg-[#E7EEF8] text-[#23446E] p-3 text-sm">
                                        This listing is {auction.status === 'active' ? 'live' : 'approved'}. Your changes go to RexBid for approval and the listing stays up with its current details until they're approved (usually within 12 hours).
                                        {Number(auction.bidCount) > 0 && ' It has bids, so the title, category, start price, reserve, bid increment and sale date are locked. Use Lower reserve or Change increment on My Listings for those.'}
                                    </div>
                                )}
                                {auction?.pendingEdit?.status === 'pending' && (
                                    <div className="mt-3 rounded-lg bg-amber-50 text-amber-900 p-3 text-sm">You already have changes waiting for approval. Saving again replaces them.</div>
                                )}
                            </div>
                            {/* <p className="text-gray-600 mb-8">Update auction listing as company</p> */}

                            {/* Progress Steps */}
                            <div className="mb-8">
                                <div className="flex items-center justify-between mb-4">
                                    {['Auction Info', 'Pricing & Bidding', 'Seller Listing Terms'].map((label, index) => (
                                        <div key={index} className="flex flex-col items-center">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step > index + 1 ? 'bg-green-500 text-white' :
                                                step === index + 1 ? 'bg-[#1e2d3b] text-white' : 'bg-gray-200 text-gray-600'
                                                }`}>
                                                {step > index + 1 ? <CheckCircle size={20} /> : index + 1}
                                            </div>
                                            <span className="text-sm mt-2 hidden md:block">{label}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="w-full bg-gray-200 h-3 rounded-full">
                                    <div
                                        className="bg-[#1e2d3b] h-3 rounded-full transition-all duration-300"
                                        style={{ width: `${(step / 3) * 100}%` }}
                                    ></div>
                                </div>
                            </div>

                            <form onSubmit={handleSubmit(updateAuctionHandler)} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                                {/* Step 1: Auction Information */}
                                {step === 1 && (
                                    <div>
                                        <h2 className="text-xl font-semibold mb-6 flex items-center">
                                            <FileText size={20} className="mr-2" />
                                            Item Information
                                        </h2>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                            <div>
                                                <label htmlFor="title" className="block text-sm font-medium text-secondary mb-1">Item Name *</label>
                                                <input
                                                    {...register('title', { required: 'Item name is required' })}
                                                    id="title"
                                                    type="text"
                                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                    placeholder="e.g., 2006 Massey 6480"
                                                />
                                                {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>}
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                                                        disabled={!watch('parentCategory') || loadingCategories}
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
                                        {watch('category') && (
                                            <div className="mb-6">
                                                <div className="mb-4 pb-2 border-b border-gray-200">
                                                    <h3 className="text-lg font-medium text-gray-800">
                                                        {selectedParent?.name} - {subCategories.find(s => s.slug === watch('category'))?.name || 'Category'} Specifications
                                                    </h3>
                                                    <p className="text-sm text-gray-500 mt-1">
                                                        Please provide the following details about your item
                                                    </p>
                                                </div>
                                                {loadingFields ? (
                                                    <div className="flex justify-center items-center py-12">
                                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                                                        <span className="ml-3 text-gray-600">Loading fields...</span>
                                                    </div>
                                                ) : categoryFields.length === 0 ? (
                                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                                                        <AlertCircle size={40} className="mx-auto text-gray-400 mb-3" />
                                                        <h3 className="text-lg font-medium text-gray-700 mb-2">No Custom Fields</h3>
                                                        <p className="text-gray-500">
                                                            This category doesn't have any specific fields configured.
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-8">
                                                        {Object.entries(
                                                            categoryFields.reduce((acc, field) => {
                                                                const group = field.group || 'General';
                                                                if (!acc[group]) acc[group] = [];
                                                                acc[group].push(field);
                                                                return acc;
                                                            }, {})
                                                        ).map(([groupName, fields]) => (
                                                            <div key={groupName} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                                                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                                                    <h3 className="font-medium text-gray-700">{groupName}</h3>
                                                                </div>
                                                                <div className="p-4">
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                        {fields
                                                                            .sort((a, b) => a.order - b.order)
                                                                            .map((field) => {
                                                                                const uniqueKey = `${field.source || 'own'}-${field._id || field.name}-${watch('category')}`;
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
                                                )}
                                            </div>
                                        )}

                                        <div className="mb-6">
                                            <label htmlFor="description" className="block text-sm font-medium text-secondary mb-1">Description *</label>
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
                                                <label htmlFor="location" className="block text-sm font-medium text-secondary mb-1">Location</label>
                                                <div className="relative">
                                                    <MapPin size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                                    <input
                                                        {...register('location')}
                                                        id="location"
                                                        type="text"
                                                        className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                        placeholder="e.g., Cavan"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label htmlFor="video" className="block text-sm font-medium text-secondary mb-1">Video Link</label>
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
                                                        placeholder="YouTube video URL"
                                                    />
                                                </div>
                                                {errors.video && <p className="text-red-500 text-sm mt-1">{errors.video.message}</p>}
                                            </div>

                                            <p className='text-xs font-medium text-orange-500 md:col-span-2'>Note: Ads with videos tend to get higher prices and less phone calls. If you want to upload a video with your ad, please WhatsApp it to: 87 203 9257</p>
                                        </div>

                                        {isTimedAuction ? (
                                            <div className="mb-6">
                                                <label
                                                    htmlFor="auctionDateId"
                                                    className="block text-sm font-medium text-secondary mb-1"
                                                >
                                                    Auction Period *
                                                </label>

                                                {canChangeSlot ? (
                                                    <>
                                                        <div className="relative">
                                                            <Calendar
                                                                size={18}
                                                                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                                                            />
                                                            <select
                                                                {...register('auctionDateId', {
                                                                    required: 'Please select an auction period',
                                                                })}
                                                                id="auctionDateId"
                                                                disabled={loadingDates}
                                                                className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                            >
                                                                <option value="">
                                                                    {loadingDates
                                                                        ? 'Loading available periods...'
                                                                        : 'Select an auction period'}
                                                                </option>
                                                                {auctionDates.map((slot) => (
                                                                    <option key={slot._id} value={slot._id}>
                                                                        {slot.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        {errors.auctionDateId && (
                                                            <p className="text-red-500 text-sm mt-1">
                                                                {errors.auctionDateId.message}
                                                            </p>
                                                        )}

                                                        {selectedAuctionDate ? (
                                                            <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                                                                <p className="text-blue-800">
                                                                    <strong>Starts:</strong>{' '}
                                                                    {new Date(selectedAuctionDate.startDate).toLocaleString('en-IE')}
                                                                </p>
                                                                <p className="text-blue-800">
                                                                    <strong>Ends:</strong>{' '}
                                                                    {new Date(selectedAuctionDate.endDate).toLocaleString('en-IE')}
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            // Slot reference may be orphaned (deleted slot) or auction predates slots
                                                            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                                                                <strong>Current period:</strong>{' '}
                                                                {new Date(auction?.startDate).toLocaleString('en-IE')} →{' '}
                                                                {new Date(auction?.endDate).toLocaleString('en-IE')}
                                                                <br />
                                                                <span className="text-xs">
                                                                    Pick a new period above to replace these dates.
                                                                </span>
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    // Auction is no longer draft — dates are frozen
                                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
                                                        <p className="text-gray-800">
                                                            <strong>Starts:</strong>{' '}
                                                            {new Date(auction?.startDate).toLocaleString('en-IE')}
                                                        </p>
                                                        <p className="text-gray-800">
                                                            <strong>Ends:</strong>{' '}
                                                            {new Date(auction?.endDate).toLocaleString('en-IE')}
                                                        </p>
                                                        <p className="text-xs text-gray-500 mt-2">
                                                            Auction dates can only be changed while the auction is in draft.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                                <div>
                                                    <label htmlFor="startDate" className="block text-sm font-medium text-secondary mb-1">Start Date & Time *</label>
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
                                                    <label htmlFor="endDate" className="block text-sm font-medium text-secondary mb-1">End Date & Time *</label>
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
                                            <label htmlFor="photo-upload" className="block text-sm font-medium text-secondary mb-1">Attach Photos *</label>
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
                                                    <p className="text-gray-600">Browse photo(s) to upload</p>
                                                    <p className="text-sm text-secondary">Recommended: at least 40 high-quality photos</p>
                                                </label>
                                            </div>
                                            {errors.photos && <p className="text-red-500 text-sm mt-1">{errors.photos.message}</p>}

                                            {/* Unified Photo Gallery with Fixed Drag & Drop */}
                                            {allPhotos.length > 0 && (
                                                <PhotoGallery
                                                    photos={allPhotos}
                                                    movePhoto={movePhoto}
                                                    removePhoto={removePhoto}
                                                    captions={photoCaptions} // Add this
                                                    onCaptionChange={handlePhotoCaptionChange} // Add this
                                                />
                                            )}
                                        </div>

                                        {/* <div className="mb-6">
                                            <label htmlFor="document-upload" className="block text-sm font-medium text-secondary mb-1">Attach Documents</label>
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
                                                    <p className="text-sm text-secondary">service Records, maintenance records, ownership docs, etc.</p>
                                                </label>
                                            </div>

                                            {existingDocuments.length > 0 && (
                                                <div className="mt-4">
                                                    <p className="text-sm text-secondary mb-2">Existing Documents:</p>
                                                    <div className="space-y-2">
                                                        {existingDocuments.map((doc, index) => (
                                                            <div key={`existing-doc-${index}`} className="bg-gray-50 p-3 rounded-lg">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="text-sm font-medium truncate">{doc.filename || doc.originalName}</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeDocument(index, true)}
                                                                        className="text-red-500 hover:text-red-700"
                                                                    >
                                                                        <X size={16} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {uploadedDocuments.length > 0 && (
                                                <div className="mt-4">
                                                    <p className="text-sm text-secondary mb-2">New Documents:</p>
                                                    <div className="space-y-2">
                                                        {uploadedDocuments.map((doc, index) => (
                                                            <div key={`new-doc-${index}`} className="bg-gray-50 p-3 rounded-lg">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="text-sm font-medium truncate">{doc.name}</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeDocument(index, false)}
                                                                        className="text-red-500 hover:text-red-700"
                                                                    >
                                                                        <X size={16} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
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
                                                    <p className="text-sm text-secondary">Service invoices, maintenance records, repair receipts, etc.</p>
                                                </label>
                                            </div>

                                            {allServiceRecords.length > 0 && (
                                                <div className="mt-4">
                                                    <p className="text-sm text-secondary mb-3">
                                                        Drag and drop to reorder other images.
                                                        <span className="block text-xs text-gray-500 mt-1">
                                                            Blue badge indicates existing images already associated with the auction.
                                                        </span>
                                                    </p>
                                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                                        {allServiceRecords.map((record, index) => (
                                                            <DraggablePhoto
                                                                key={record.id}
                                                                photo={record}
                                                                index={index}
                                                                movePhoto={moveServiceRecord}
                                                                removePhoto={removeServiceRecord}
                                                                caption={serviceRecordCaptions[index] || ''}
                                                                onCaptionChange={handleServiceRecordCaptionChange}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
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

                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-secondary mb-1">Auction Type *</label>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> {/* Changed from grid-cols-3 to grid-cols-4 */}
                                                {[
                                                    { value: 'reserve', label: 'Reserve Auction' },
                                                    { value: 'standard', label: 'No Reserve Auction' },
                                                    // { value: 'buy_now', label: 'Buy Now Auction' },
                                                    // { value: 'giveaway', label: 'Free Giveaway' },
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
                                            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
                                                <p className="text-green-700 flex items-center gap-2">
                                                    <Zap size={18} />
                                                    <span>This auction will start immediately upon creation.</span>
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
                                                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600">{baseCurrency === 'GBP' ? '£' : '€'}</span>
                                                                <input
                                                                    {...register('startPrice', {
                                                                        required: watch('auctionType') !== 'giveaway' ? 'Start price is required' : false,
                                                                        min: { value: 0, message: 'Price must be positive' },
                                                                        validate: value => validateMinStart(value, watch('auctionType'), user?.currency)
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
                                                            <p className="text-sm text-secondary mt-1">{minimumsHint(user?.currency)}</p>
                                                        </div>)}

                                                    {(watch('auctionType') === 'standard' || watch('auctionType') === 'reserve') && (
                                                        <div>
                                                            <label htmlFor="bidIncrement" className="block text-sm font-medium text-secondary mb-1">Bid Increment *</label>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600">{baseCurrency === 'GBP' ? '£' : '€'}</span>
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
                                                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600">{baseCurrency === 'GBP' ? '£' : '€'}</span>
                                                            <input
                                                                {...register('reservePrice', {
                                                                    required: watch('auctionType') === 'reserve' ? 'Reserve price is required' : false,
                                                                    min: { value: 0, message: 'Price must be positive' },
                                                                    validate: value => {
                                                                        const startPrice = parseFloat(watch('startPrice') || 0);
                                                                        const reservePrice = parseFloat(value);
                                                                        if (reservePrice < startPrice) return 'Reserve price must be greater than or equal to start price';
                                                                            return validateMinReserve(value, user?.currency);
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

                                                {watch('auctionType') === 'reserve' && (
                                                    <div className="mb-6">
                                                        <label htmlFor="liveBuyNowPrice" className="block text-sm font-medium text-secondary mb-1">Buy It Now price (optional)</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600">{user?.currency === 'GBP' ? '£' : '€'}</span>
                                                            <input
                                                                {...register('liveBuyNowPrice', {
                                                                    validate: (value) => {
                                                                        if (value === '' || value === undefined || value === null) return true;
                                                                        const price = parseFloat(value);
                                                                        if (!(price > 0)) return 'Enter a valid price, or leave it empty';
                                                                        const min = minLivePrice(watch('reservePrice'));
                                                                        return price >= min || `Must be at least 15% above the reserve (${min.toLocaleString('en-IE')} or more)`;
                                                                    },
                                                                })}
                                                                id="liveBuyNowPrice"
                                                                type="number"
                                                                step="1"
                                                                min="0"
                                                                className="w-full pl-8 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                                                placeholder="Leave empty for no Buy It Now"
                                                            />
                                                        </div>
                                                        {errors.liveBuyNowPrice && <p className="text-red-500 text-sm mt-1">{errors.liveBuyNowPrice.message}</p>}
                                                        <p className="text-sm text-secondary mt-1">
                                                            Lets a buyer buy outright while the auction is live. At least 15% above the reserve. Closes once bidding reaches 90% of the reserve or {CLOSE_CUTOFF_HOURS} hours before the end. Can't be added or raised once bidding starts.
                                                        </p>
                                                    </div>
                                                )}

                                                {watch('auctionType') === 'buy_now' && (
                                                    <div className="mb-4">
                                                        <label htmlFor="buyNowPrice" className="block text-sm font-medium text-secondary mb-1">
                                                            Buy Now Price *
                                                        </label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600">{baseCurrency === 'GBP' ? '£' : '€'}</span>
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
                                        {watch('auctionType') === 'giveaway' && (
                                            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-6">
                                                <h3 className="text-lg font-semibold text-green-700 mb-2 flex items-center gap-2">
                                                    <span>🎁 Free Giveaway</span>
                                                </h3>
                                                <p className="text-green-600 mb-2">
                                                    This item will be given away for free. The first user who clicks "Claim" will win it immediately.
                                                </p>
                                                <p className="text-sm text-green-500">
                                                    No pricing needed. The auction will end as soon as someone claims it.
                                                </p>
                                            </div>
                                        )}
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
                                            disabled={isSubmitting}
                                            className="flex items-center px-6 py-2 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 text-white hover:from-orange-500 hover:via-orange-600 hover:to-orange-700 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            <Gavel size={18} className="mr-2" />
                                            {isSubmitting ? 'Updating Auction...' : 'Update Auction'}
                                        </button>
                                    )}
                                </div>
                                {errors.endDate && <p className='text-sm text-orange-500 float-right'>Please set end date to proceed.</p>}
                            </form>
                        </div>
                    </CompanyContainer>
                </div>
            </section>
        </DndProvider>
    );
};

export default EditAuction;