import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Flag, HelpCircle, Loader, MessageSquareReply, Search, Send, ShieldCheck, ThumbsUp, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import axiosInstance from "../utils/axiosInstance";
import { useAuth } from "../contexts/AuthContext";

// Listing Questions & Answers.
// Buyers ask, only the seller (or RexBid) answers, and everything stays on the
// listing so every bidder sees the same information. The backend blocks phone
// numbers, emails and "let's deal privately" messages; the hint below just
// warns people before they press send.

const QUESTION_MAX = 600;
const ANSWER_MAX = 1500;

const looksLikeContactDetails = (text) => {
    const t = String(text || "");
    const digits = (t.match(/\+?\d[\d\s().-]{5,}\d/g) || []).some((r) => r.replace(/\D/g, "").length >= 7 && /^(\+|0)/.test(r.trim()));
    return digits || /@|whats\s*app|viber|telegram|\b(ring|call|text|phone)\s+me\b|my (number|mobile|email)|privately/i.test(t);
};

const timeAgo = (date) => {
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return new Date(date).toLocaleDateString("en-IE", { day: "numeric", month: "short" });
};

const ContactWarning = () => (
    <p className="mt-2 flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
        <span>Phone numbers, emails and requests to deal off RexBid can't be posted. Keep it on the listing so everyone sees the answer and your purchase stays protected.</span>
    </p>
);

const AnswerForm = ({ question, onAnswered }) => {
    const [text, setText] = useState("");
    const [saving, setSaving] = useState(false);
    const warn = looksLikeContactDetails(text);

    const submit = async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setSaving(true);
        try {
            const { data } = await axiosInstance.post(`/api/v1/questions/${question._id}/answers`, { content: text.trim() });
            onAnswered(question._id, data.data.answer);
            setText("");
            toast.success("Answer posted on the listing");
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not post your answer");
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="mt-3">
            <label htmlFor={`answer-${question._id}`} className="sr-only">Your answer</label>
            <textarea
                id={`answer-${question._id}`}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, ANSWER_MAX))}
                rows={3}
                placeholder="Type your answer. It will be shown on the listing for all bidders."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#edcd1f] text-sm"
            />
            {warn && <ContactWarning />}
            <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">{text.length}/{ANSWER_MAX}</span>
                <button
                    type="submit"
                    disabled={!text.trim() || saving}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white text-sm rounded-md hover:bg-gray-800 disabled:opacity-50"
                >
                    {saving ? <Loader size={14} className="animate-spin" /> : <MessageSquareReply size={14} />}
                    Post answer
                </button>
            </div>
        </form>
    );
};

const QuestionCard = ({ q, canAnswer, user, onAnswered, onHelpful, onDelete, onReport }) => {
    const answered = q.answers.length > 0;
    const [addingMore, setAddingMore] = useState(false);
    return (
        <li id={`q-${q._id}`} className="border border-gray-200 rounded-lg p-4 scroll-mt-28">
            <div className="flex gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#edcd1f] text-black text-sm font-bold flex items-center justify-center" aria-hidden="true">Q</span>
                <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-medium whitespace-pre-wrap break-words">{q.content}</p>
                    <p className="text-xs text-gray-500 mt-1">
                        Asked by {q.isMine ? "you" : q.askedBy} · {timeAgo(q.createdAt)}
                    </p>
                </div>
            </div>

            {answered ? (
                <div className="mt-3 space-y-3">
                    {q.answers.map((a) => (
                        <div key={a._id} className="flex gap-3 sm:ml-10">
                            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-black text-white text-sm font-bold flex items-center justify-center" aria-hidden="true">A</span>
                            <div className="flex-1 min-w-0 bg-gray-50 rounded-md px-3 py-2">
                                <p className="text-gray-800 whitespace-pre-wrap break-words">{a.content}</p>
                                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                    <CheckCircle2 size={12} className="text-green-600" />
                                    {a.role === "admin" ? "Answer from RexBid" : `Answer from the seller, ${a.by}`} · {timeAgo(a.createdAt)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="mt-3 sm:ml-10 inline-flex items-center gap-1.5 text-xs text-gray-600 bg-gray-100 rounded-full px-3 py-1">
                    <Clock size={12} /> Waiting for the seller's answer
                </p>
            )}

            {canAnswer && (
                <div className="sm:ml-10">
                    {answered && !addingMore ? (
                        <button type="button" onClick={() => setAddingMore(true)} className="mt-3 text-sm underline text-gray-700 hover:text-black">
                            Add more detail
                        </button>
                    ) : (
                        <AnswerForm question={q} onAnswered={(id, a) => { setAddingMore(false); onAnswered(id, a); }} />
                    )}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-4 mt-3 sm:ml-10 text-xs text-gray-500">
                <button
                    type="button"
                    onClick={() => onHelpful(q)}
                    className={`inline-flex items-center gap-1 hover:text-black ${q.markedHelpful ? "text-black font-semibold" : ""}`}
                    aria-pressed={q.markedHelpful}
                >
                    <ThumbsUp size={13} /> Helpful{q.helpfulCount > 0 ? ` (${q.helpfulCount})` : ""}
                </button>
                {user && !q.isMine && (
                    <button type="button" onClick={() => onReport(q)} className="inline-flex items-center gap-1 hover:text-black">
                        <Flag size={13} /> Report
                    </button>
                )}
                {q.isMine && !answered && (
                    <button type="button" onClick={() => onDelete(q)} className="inline-flex items-center gap-1 hover:text-red-600">
                        <Trash2 size={13} /> Withdraw
                    </button>
                )}
            </div>
        </li>
    );
};

const QuestionsSection = ({ auctionId, onCountChange }) => {
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [text, setText] = useState("");
    const [asking, setAsking] = useState(false);
    const inputRef = useRef(null);
    const scrolledToHash = useRef(false);

    const load = async () => {
        try {
            const { data: res } = await axiosInstance.get(`/api/v1/questions/auction/${auctionId}`);
            setData(res.data);
        } catch {
            setData({ questions: [], stats: { total: 0, answered: 0 }, canAsk: false });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (auctionId) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auctionId, user?._id]);

    const questions = useMemo(() => data?.questions || [], [data]);

    useEffect(() => {
        onCountChange?.(questions.length);
        // Open a question linked from an email or text (…#q-<id>).
        if (!scrolledToHash.current && questions.length && window.location.hash.startsWith("#q-")) {
            scrolledToHash.current = true;
            setTimeout(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
        }
    }, [questions, onCountChange]);

    const viewerIsSeller = !!data?.viewerIsSeller;
    const canAnswer = viewerIsSeller || !!data?.viewerIsStaff;
    const awaiting = questions.filter((q) => q.answers.length === 0);

    const visible = useMemo(() => {
        let list = questions;
        if (filter === "answered") list = list.filter((q) => q.answers.length > 0);
        if (filter === "awaiting") list = list.filter((q) => q.answers.length === 0);
        const term = search.trim().toLowerCase();
        if (term) {
            list = list.filter((q) => q.content.toLowerCase().includes(term) || q.answers.some((a) => a.content.toLowerCase().includes(term)));
        }
        // Seller: unanswered first so nothing is missed.
        if (canAnswer) list = [...list].sort((a, b) => (a.answers.length > 0) - (b.answers.length > 0));
        return list;
    }, [questions, filter, search, canAnswer]);

    const ask = async (e) => {
        e.preventDefault();
        if (text.trim().length < 5) return;
        setAsking(true);
        try {
            const { data: res } = await axiosInstance.post(`/api/v1/questions/auction/${auctionId}`, { content: text.trim() });
            setData((d) => ({ ...d, questions: [res.data.question, ...(d?.questions || [])], stats: { ...d.stats, total: (d.stats?.total || 0) + 1 } }));
            setText("");
            toast.success("Question sent. We'll email you when the seller answers.");
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not send your question", { duration: 6000 });
        } finally {
            setAsking(false);
        }
    };

    const onAnswered = (questionId, answer) => {
        setData((d) => ({
            ...d,
            questions: d.questions.map((q) => (q._id === questionId ? { ...q, answers: [...q.answers, answer], answeredAt: q.answeredAt || answer.createdAt } : q)),
        }));
    };

    const onHelpful = async (q) => {
        if (!user) return toast("Log in to mark questions as helpful");
        try {
            const { data: res } = await axiosInstance.post(`/api/v1/questions/${q._id}/helpful`);
            setData((d) => ({ ...d, questions: d.questions.map((x) => (x._id === q._id ? { ...x, ...res.data } : x)) }));
        } catch {
            toast.error("Could not update");
        }
    };

    const onDelete = async (q) => {
        if (!window.confirm("Withdraw this question?")) return;
        try {
            await axiosInstance.delete(`/api/v1/questions/${q._id}`);
            setData((d) => ({ ...d, questions: d.questions.filter((x) => x._id !== q._id) }));
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not withdraw");
        }
    };

    const onReport = async (q) => {
        if (!window.confirm("Report this question to RexBid for review?")) return;
        try {
            await axiosInstance.post(`/api/v1/comments/${q._id}/flag`, { reason: "Reported from listing Q&A" });
            toast.success("Thanks, we'll take a look");
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not report");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-gray-500 py-6">
                <Loader size={16} className="animate-spin" /> Loading questions…
            </div>
        );
    }

    const stats = data?.stats || {};
    const warn = looksLikeContactDetails(text);

    return (
        <section aria-labelledby="qa-heading" className="max-w-4xl">
            <div className="mb-5">
                <h3 id="qa-heading" className="text-xl font-semibold text-primary flex items-center gap-2">
                    <HelpCircle size={20} /> Questions &amp; Answers
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                    Ask the seller anything about this lot. Answers are posted here so every bidder sees the same information.
                </p>
                {stats.total > 0 && (
                    <p className="text-sm text-gray-500 mt-2">
                        {stats.total} question{stats.total === 1 ? "" : "s"} · {stats.answered} answered
                        {stats.typicalAnswerHours ? ` · Seller usually answers within ${stats.typicalAnswerHours} hour${stats.typicalAnswerHours === 1 ? "" : "s"}` : ""}
                    </p>
                )}
            </div>

            {/* Seller view */}
            {viewerIsSeller && (
                <div className="mb-6 rounded-lg border border-[#edcd1f] bg-[#edcd1f]/10 p-4 text-sm text-gray-800">
                    <p className="font-semibold">
                        {awaiting.length > 0
                            ? `You have ${awaiting.length} question${awaiting.length === 1 ? "" : "s"} waiting for an answer.`
                            : "You're the seller of this lot."}
                    </p>
                    <p className="mt-1">
                        Buyers who get clear, quick answers bid with more confidence. When a new question comes in we'll email you, and you may get a text you can reply to directly.
                        Please don't include phone numbers or emails in your answers.
                    </p>
                </div>
            )}

            {/* Ask box */}
            {!viewerIsSeller && data?.canAsk && (
                user ? (
                    <form onSubmit={ask} className="mb-6 rounded-lg border border-gray-200 p-4 bg-white">
                        <label htmlFor="qa-ask" className="block font-medium text-gray-900 mb-2">Ask the seller a question</label>
                        <textarea
                            id="qa-ask"
                            ref={inputRef}
                            value={text}
                            onChange={(e) => setText(e.target.value.slice(0, QUESTION_MAX))}
                            rows={3}
                            placeholder="e.g. Has the clutch been replaced? Any play in the front axle?"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#edcd1f]"
                        />
                        {warn && <ContactWarning />}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
                            <p className="text-xs text-gray-500">
                                Your first name is shown with your question. We'll email you when it's answered. {text.length}/{QUESTION_MAX}
                            </p>
                            <button
                                type="submit"
                                disabled={text.trim().length < 5 || asking}
                                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#edcd1f] text-black font-medium rounded-md hover:bg-[#edcd1f]/90 disabled:opacity-50"
                            >
                                {asking ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
                                Ask the seller
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p className="text-gray-700">Have a question about this lot? Log in or register to ask the seller.</p>
                        <div className="flex gap-2">
                            <Link to="/login" className="px-4 py-2 bg-black text-white rounded-md text-sm">Log in</Link>
                            <Link to="/register" className="px-4 py-2 border border-black rounded-md text-sm">Register</Link>
                        </div>
                    </div>
                )
            )}
            {!data?.canAsk && !viewerIsSeller && (
                <p className="mb-6 text-sm text-gray-500">Questions are closed for this lot.</p>
            )}

            {/* Filters */}
            {questions.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter questions">
                        {[
                            ["all", `All (${questions.length})`],
                            ["answered", `Answered (${questions.length - awaiting.length})`],
                            ["awaiting", `Awaiting answer (${awaiting.length})`],
                        ].map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setFilter(id)}
                                aria-pressed={filter === id}
                                className={`text-sm px-3 py-1.5 rounded-full border ${filter === id ? "bg-black text-white border-black" : "border-gray-300 text-gray-700 hover:border-black"}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    {questions.length > 5 && (
                        <label className="relative sm:ml-auto">
                            <span className="sr-only">Search questions</span>
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search questions"
                                className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-full w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-[#edcd1f]"
                            />
                        </label>
                    )}
                </div>
            )}

            {/* List */}
            {questions.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border border-dashed border-gray-300 rounded-lg">
                    <HelpCircle size={36} className="mx-auto mb-2 text-gray-300" />
                    <p className="font-medium">No questions yet</p>
                    <p className="text-sm">{viewerIsSeller ? "Buyers' questions will appear here." : "Be the first to ask. Every bidder will see the answer."}</p>
                </div>
            ) : visible.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No questions match.</p>
            ) : (
                <ul className="space-y-3">
                    {visible.map((q) => (
                        <QuestionCard
                            key={q._id}
                            q={q}
                            user={user}
                            canAnswer={canAnswer}
                            onAnswered={onAnswered}
                            onHelpful={onHelpful}
                            onDelete={onDelete}
                            onReport={onReport}
                        />
                    ))}
                </ul>
            )}

            <p className="mt-6 flex items-start gap-2 text-sm text-gray-600">
                <ShieldCheck size={16} className="mt-0.5 flex-shrink-0 text-green-700" />
                <span>Buy through RexBid and your payment is protected. RexBid will never ask you to pay a seller directly or arrange a sale outside the auction.</span>
            </p>
        </section>
    );
};

export default QuestionsSection;
