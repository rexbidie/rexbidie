import { useState, useEffect } from "react";
import {
    X,
    Users,
    AlertCircle,
    Info,
    Mail,
} from "lucide-react";
import axiosInstance from "../../utils/axiosInstance";
import toast from "react-hot-toast";
import LoadingSpinner from "../LoadingSpinner";
import AsyncSelect from "react-select/async";
import RTE from "../RTE";
import { useForm } from "react-hook-form";

const GROUP_OPTIONS = [
    { value: "all_sellers", label: "All Sellers" },
    { value: "all_companies", label: "All Companies" },
    { value: "sellers_and_companies", label: "Sellers & Companies" },
    { value: "all_bidders", label: "All Bidders" },
    { value: "all_users", label: "All Users" },
];

const PLACEHOLDERS = [
    { key: "{{firstName}}", desc: "Recipient's first name" },
    { key: "{{lastName}}", desc: "Recipient's last name" },
    { key: "{{username}}", desc: "Recipient's username" },
    { key: "{{email}}", desc: "Recipient's email" },
    { key: "{{companyName}}", desc: "Recipient's company name" },
];

const EmailCampaignFormModal = ({ isOpen, onClose, onSuccess, campaign }) => {
    const { control, getValues, reset: resetBody } = useForm({
        defaultValues: { body: "" },
    });

    // ─── Local state for non-RHF fields ─────────────────────
    const [formData, setFormData] = useState({
        title: "",
        recipientGroups: [],
        specificUserIds: [],
        scheduleDate: "",
    });
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    // Reset / prefill when modal opens
    useEffect(() => {
        if (!isOpen) return;

        if (campaign) {
            const groups = campaign.recipients?.groups || [];
            const userIds = campaign.recipients?.specificUserIds || [];

            setFormData({
                title: campaign.title || "",
                recipientGroups: groups,
                specificUserIds: userIds,
                scheduleDate: campaign.scheduleDate
                    ? new Date(campaign.scheduleDate).toISOString().slice(0, 16)
                    : "",
            });
            resetBody({ body: campaign.body || "" });

            if (userIds.length > 0) fetchUserDetails(userIds);
            else setSelectedUsers([]);
        } else {
            setFormData({
                title: "",
                recipientGroups: [],
                specificUserIds: [],
                scheduleDate: "",
            });
            resetBody({ body: "" });
            setSelectedUsers([]);
        }
        setPreviewData(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, campaign]);

    const fetchUserDetails = async (userIds) => {
        if (!userIds?.length) return;
        try {
            const responses = await Promise.all(
                userIds.map((id) =>
                    axiosInstance
                        .get(`/api/v1/admin/users/${id}`)
                        .then((res) => res.data.data.user)
                        .catch(() => null)
                )
            );
            const options = responses
                .filter(Boolean)
                .map((user) => ({
                    value: user._id,
                    label: `${user.username || user.firstName} (${user.email})`,
                    user,
                }));
            setSelectedUsers(options);
        } catch (error) {
            console.error("Failed to fetch user details:", error);
        }
    };

    const loadUserOptions = async (inputValue) => {
        if (!inputValue || inputValue.length < 1) return [];
        try {
            const { data } = await axiosInstance.get("/api/v1/admin/users", {
                params: { search: inputValue, limit: 20 },
            });
            if (!data.success) return [];
            return data.data.users
                .filter((u) => !["admin", "cashier", "staff"].includes(u.userType))
                .map((user) => ({
                    value: user._id,
                    label: `${user.username || user.firstName} (${user.email})`,
                    user,
                }));
        } catch (error) {
            console.error("User search error:", error);
            return [];
        }
    };

    const handleUserSelectChange = (options) => {
        setSelectedUsers(options || []);
        setFormData((prev) => ({
            ...prev,
            specificUserIds: (options || []).map((opt) => opt.value),
        }));
        setPreviewData(null);
    };

    const toggleGroup = (groupValue) => {
        setFormData((prev) => {
            const has = prev.recipientGroups.includes(groupValue);
            return {
                ...prev,
                recipientGroups: has
                    ? prev.recipientGroups.filter((g) => g !== groupValue)
                    : [...prev.recipientGroups, groupValue],
            };
        });
        setPreviewData(null);
    };

    const handlePreview = async () => {
        if (
            formData.recipientGroups.length === 0 &&
            formData.specificUserIds.length === 0
        ) {
            toast.error("Select at least one group or specific user");
            return;
        }
        setPreviewLoading(true);
        try {
            const { data } = await axiosInstance.post(
                "/api/v1/admin/email/campaigns/preview-recipients",
                {
                    recipients: {
                        groups: formData.recipientGroups,
                        specificUserIds: formData.specificUserIds,
                    },
                }
            );
            if (data.success) setPreviewData(data.data);
        } catch (error) {
            toast.error(
                error.response?.data?.message || "Failed to preview recipients"
            );
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const body = getValues("body");

        if (!formData.title.trim()) {
            toast.error("Subject / title is required");
            return;
        }
        if (!body || body.trim() === "" || body === "<p><br></p>") {
            toast.error("Email body is required");
            return;
        }
        if (
            formData.recipientGroups.length === 0 &&
            formData.specificUserIds.length === 0
        ) {
            toast.error("Select at least one recipient group or specific user");
            return;
        }

        setIsSubmitting(true);
        try {
            let scheduleISO = null;
            if (formData.scheduleDate) {
                const date = new Date(formData.scheduleDate);
                if (!isNaN(date.getTime())) {
                    if (date <= new Date()) {
                        toast.error("Schedule date must be in the future");
                        setIsSubmitting(false);
                        return;
                    }
                    scheduleISO = date.toISOString();
                }
            }

            const payload = {
                title: formData.title.trim(),
                body,
                recipients: {
                    groups: formData.recipientGroups,
                    specificUserIds: formData.specificUserIds,
                },
                scheduleDate: scheduleISO,
            };

            const response = campaign
                ? await axiosInstance.put(
                    `/api/v1/admin/email/campaigns/${campaign._id}`,
                    payload
                )
                : await axiosInstance.post("/api/v1/admin/email/campaigns", payload);

            if (response.data.success) {
                toast.success(response.data.message || "Campaign saved");
                onSuccess();
                onClose();
                scrollTo({ top: 0, behavior: 'smooth' });
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Operation failed");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
                    <h3 className="text-xl font-semibold">
                        {campaign ? "Edit Campaign" : "New Email Campaign"}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Subject / Title */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Subject Line *
                        </label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) =>
                                setFormData({ ...formData, title: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g., New arrivals this week"
                            maxLength={200}
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Also used as the campaign title in the list.
                        </p>
                    </div>

                    {/* Body */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email Body *
                        </label>
                        <div className="border border-gray-300 rounded-lg overflow-hidden">
                            <RTE
                                name="body"
                                control={control}
                                placeholder="Write your email content..."
                                imageUploadUrl="/api/v1/admin/email/upload-image"
                                allowButtons
                            />
                        </div>

                        {/* Placeholder helper */}
                        {/* <div className="mt-2 text-xs text-gray-500">
                            <p className="font-medium mb-1 flex items-center gap-1">
                                <Info size={12} /> Available placeholders (auto-replaced at
                                send time):
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {PLACEHOLDERS.map((p) => (
                                    <span
                                        key={p.key}
                                        className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded font-mono"
                                        title={p.desc}
                                    >
                                        {p.key}
                                    </span>
                                ))}
                            </div>
                        </div> */}
                    </div>

                    {/* Recipients */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Recipient Groups
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                            {GROUP_OPTIONS.map((g) => (
                                <label
                                    key={g.value}
                                    className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${formData.recipientGroups.includes(g.value)
                                        ? "border-primary bg-primary/5 text-primary"
                                        : "border-gray-300 hover:bg-gray-50"
                                        }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={formData.recipientGroups.includes(g.value)}
                                        onChange={() => toggleGroup(g.value)}
                                        className="accent-primary"
                                    />
                                    <span className="text-sm font-medium">{g.label}</span>
                                </label>
                            ))}
                        </div>

                        <label className="block text-sm font-medium text-gray-700 mb-1 mt-4">
                            Individual Users (optional)
                        </label>
                        <AsyncSelect
                            isMulti
                            cacheOptions
                            defaultOptions={false}
                            loadOptions={loadUserOptions}
                            onChange={handleUserSelectChange}
                            value={selectedUsers}
                            placeholder="Search users by username, email..."
                            classNamePrefix="react-select"
                            loadingMessage={() => "Searching users..."}
                            noOptionsMessage={() => "No users found"}
                            styles={{
                                control: (base) => ({
                                    ...base,
                                    minHeight: "42px",
                                    borderColor: "#d1d5db",
                                }),
                            }}
                        />

                        <button
                            type="button"
                            onClick={handlePreview}
                            disabled={previewLoading}
                            className="mt-3 text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 disabled:opacity-50"
                        >
                            {previewLoading ? (
                                <LoadingSpinner size="sm" />
                            ) : (
                                <Users size={14} />
                            )}
                            Preview Recipients
                        </button>

                        {previewData && (
                            <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                                <p>
                                    <Mail size={14} className="inline mr-1" />
                                    Total resolved recipients:{" "}
                                    <strong>{previewData.total}</strong>
                                </p>
                                {previewData.sample?.length > 0 && (
                                    <div className="mt-2">
                                        <p className="font-medium text-gray-700 mb-1">Sample:</p>
                                        <ul className="list-disc list-inside text-gray-600 space-y-0.5">
                                            {previewData.sample.slice(0, 5).map((u, i) => (
                                                <li key={i}>
                                                    {u.firstName} {u.lastName}{" "}
                                                    <span className="text-gray-500">
                                                        ({u.email})
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {previewData.total === 0 && (
                                    <p className="mt-1 text-red-600 text-xs flex items-center gap-1">
                                        <AlertCircle size={12} /> No users match this selection.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Schedule */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Schedule (optional)
                        </label>
                        <input
                            type="datetime-local"
                            value={formData.scheduleDate}
                            onChange={(e) =>
                                setFormData({ ...formData, scheduleDate: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Leave empty to save as a draft (send manually later).
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 bg-primary text-white py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50"
                        >
                            {isSubmitting
                                ? "Saving..."
                                : campaign
                                    ? "Update Campaign"
                                    : formData.scheduleDate
                                        ? "Create & Schedule"
                                        : "Create Draft"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EmailCampaignFormModal;