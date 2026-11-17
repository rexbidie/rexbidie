import { useMemo, useRef } from "react";
import { Controller } from "react-hook-form";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import toast from "react-hot-toast";
import axiosInstance from "../utils/axiosInstance";
import { compressAuctionImage } from "../utils/compressImage";
import { registerEmailButton, normaliseUrl } from "./emailButtonBlot";

// Server accepts up to 25 MB; big phone photos are shrunk in the browser
// first, so this only stops genuinely huge files.
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const isHeicFile = (file) =>
    /^image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name || "");

function RTE({
    name = "content",
    control,
    defaultValue = "",
    placeholder,
    rules,
    imageUploadUrl,
    allowButtons = false,
}) {
    const quillRef = useRef(null);
    if (allowButtons) registerEmailButton();

    const imageHandler = useMemo(() => {
        if (!imageUploadUrl) return null;

        return () => {
            const input = document.createElement("input");
            input.setAttribute("type", "file");
            input.setAttribute("accept", "image/*,.heic,.heif");
            input.click();

            input.onchange = async () => {
                const picked = input.files?.[0];
                if (!picked) return;

                if (picked.size > MAX_IMAGE_BYTES) {
                    toast.error("Image must be under 25MB");
                    return;
                }

                const toastId = toast.loading("Uploading image...");
                try {
                    // iPhone photos (HEIC) go up as they are and the server
                    // converts them; everything else is shrunk here first.
                    let file = picked;
                    if (isHeicFile(picked)) {
                        if (!picked.type) {
                            file = new File([picked], picked.name, { type: "image/heic" });
                        }
                    } else {
                        file = await compressAuctionImage(picked);
                    }

                    const formData = new FormData();
                    formData.append("image", file);

                    const { data } = await axiosInstance.post(
                        imageUploadUrl,
                        formData,
                        { headers: { "Content-Type": "multipart/form-data" } }
                    );

                    if (!data.success || !data.data?.url) {
                        throw new Error(data.message || "Upload failed");
                    }

                    const quill = quillRef.current?.getEditor();
                    if (!quill) throw new Error("Editor not ready");

                    const range = quill.getSelection(true) || {
                        index: quill.getLength(),
                        length: 0,
                    };
                    quill.insertEmbed(range.index, "image", data.data.url, "user");
                    quill.setSelection(range.index + 1);

                    toast.success("Image uploaded", { id: toastId });
                } catch (error) {
                    console.error("Image upload failed:", error);
                    toast.error(
                        error.response?.data?.message || error.message || "Upload failed",
                        { id: toastId }
                    );
                }
            };
        };
    }, [imageUploadUrl]);

    const buttonHandler = useMemo(() => {
        if (!allowButtons) return null;
        return () => {
            const quill = quillRef.current?.getEditor();
            if (!quill) return;
            const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
            const selected = range.length ? quill.getText(range.index, range.length).trim() : "";

            const text = window.prompt("Button text", selected || "View lots closing tonight");
            if (text === null || !text.trim()) return;
            const rawUrl = window.prompt("Button link", "https://rexbid.ie");
            if (rawUrl === null) return;
            const url = normaliseUrl(rawUrl);
            if (!url) {
                toast.error("Enter a full link, e.g. https://rexbid.ie");
                return;
            }

            if (range.length) quill.deleteText(range.index, range.length, "user");
            quill.insertEmbed(range.index, "emailButton", { text: text.trim(), url }, "user");
            quill.setSelection(range.index + 1, 0, "user");
        };
    }, [allowButtons]);

    const modules = useMemo(
        () => ({
            toolbar: {
                container: [
                    [{ header: [1, 2, 3, false] }],
                    ["bold", "italic", "underline", "strike"],
                    [{ list: "ordered" }, { list: "bullet" }],
                    [{ align: [] }],
                    allowButtons ? ["link", "image", "emailButton"] : ["link", "image"],
                    ["clean"],
                ],
                handlers: {
                    ...(imageHandler && { image: imageHandler }),
                    ...(buttonHandler && { emailButton: buttonHandler }),
                },
            },
        }),
        [imageHandler, buttonHandler, allowButtons]
    );

    return (
        <Controller
            name={name}
            control={control}
            defaultValue={defaultValue}
            rules={rules}
            render={({ field: { onChange, onBlur, value } }) => (
                <div className="[&_.ql-editor]:min-h-[400px] [&_.ql-editor]:max-h-[600px] [&_.ql-editor]:overflow-y-auto">
                    <ReactQuill
                        ref={quillRef}
                        theme="snow"
                        value={value ?? ""}
                        onChange={onChange}
                        onBlur={onBlur}
                        placeholder={placeholder}
                        modules={modules}
                        style={{ minHeight: 300 }}
                    />
                </div>
            )}
        />
    );
}

export default RTE;