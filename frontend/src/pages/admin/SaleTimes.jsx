// Admin → Sale Night Times.
// Re-time the lots closing on a sale day: load the day, change times one by
// one or paste a plan (one line per lot: listing ID and HH:MM), press
// "Check changes" to see exactly what will move, then "Apply".
// Times are Irish time. Several lots may close at the same minute.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, Loader2, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { AdminContainer, AdminHeader, AdminSidebar } from "../../components";
import axiosInstance from "../../utils/axiosInstance";

const todayKey = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Dublin" });
const ID_RE = /\b[a-f0-9]{24}\b/i;
const TIME_RE = /\b([01]\d|2[0-3]):([0-5]\d)\b/;

const SaleTimes = () => {
    const [params, setParams] = useSearchParams();
    const [day, setDay] = useState(params.get("day") || todayKey());
    const [lots, setLots] = useState([]);
    const [newTimes, setNewTimes] = useState({}); // id -> "HH:MM"
    const [loading, setLoading] = useState(false);
    const [plan, setPlan] = useState("");
    const [check, setCheck] = useState(null); // { updates, errors }
    const [checking, setChecking] = useState(false);
    const [applying, setApplying] = useState(false);

    const load = async (d = day) => {
        setLoading(true);
        setCheck(null);
        try {
            const { data } = await axiosInstance.get("/api/v1/admin/sale-times", { params: { day: d } });
            setLots(data.data.lots);
            setNewTimes({});
        } catch (e) {
            toast.error(e?.response?.data?.message || "Couldn't load the lots");
        } finally {
            setLoading(false);
        }
    };

    // Load the day once on open; after that the Load lots button reloads.
    useEffect(() => {
        load(day);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const changes = useMemo(
        () => Object.entries(newTimes)
            .filter(([id, t]) => t && lots.find((l) => l.id === id)?.time !== t)
            .map(([id, time]) => ({ id, time })),
        [newTimes, lots]
    );

    const setTime = (id, t) => {
        setNewTimes((prev) => ({ ...prev, [id]: t }));
        setCheck(null);
    };

    const fillFromPlan = () => {
        const next = { ...newTimes };
        let filled = 0;
        const unknown = [];
        for (const line of plan.split(/\r?\n/)) {
            const id = line.match(ID_RE)?.[0]?.toLowerCase();
            const time = line.match(TIME_RE)?.[0];
            if (!id || !time) continue;
            if (!lots.some((l) => l.id === id)) { unknown.push(id); continue; }
            next[id] = time;
            filled += 1;
        }
        setNewTimes(next);
        setCheck(null);
        toast.success(`Filled in ${filled} time(s)`);
        if (unknown.length) toast.error(`${unknown.length} line(s) are for lots not closing on ${day}`);
    };

    const runCheck = async () => {
        setChecking(true);
        try {
            const { data } = await axiosInstance.post("/api/v1/admin/sale-times", { day, changes, apply: false });
            setCheck({ updates: data.data.updates, errors: [] });
        } catch (e) {
            setCheck({ updates: e?.response?.data?.data?.updates || [], errors: e?.response?.data?.errors || [e?.response?.data?.message || "Check failed"] });
        } finally {
            setChecking(false);
        }
    };

    const apply = async () => {
        if (!check || check.errors.length || !check.updates.length) return;
        if (!window.confirm(`Change the closing time of ${check.updates.length} lot(s) on ${day}? Bidders see the new times straight away.`)) return;
        setApplying(true);
        try {
            const { data } = await axiosInstance.post("/api/v1/admin/sale-times", { day, changes, apply: true });
            toast.success(data.message, { duration: 6000 });
            if (data.data.skipped?.length) toast.error(`Skipped (changed meanwhile): ${data.data.skipped.join(", ")}`, { duration: 8000 });
            await load(day);
            setPlan("");
        } catch (e) {
            toast.error(e?.response?.data?.message || "Couldn't change the times");
            if (e?.response?.data?.errors) setCheck({ updates: [], errors: e.response.data.errors });
        } finally {
            setApplying(false);
        }
    };

    // Sorted by the time each lot will close after the change.
    const rows = useMemo(() => lots
        .map((l) => ({ ...l, newTime: newTimes[l.id] || l.time }))
        .sort((a, b) => a.newTime.localeCompare(b.newTime) || a.title.localeCompare(b.title)), [lots, newTimes]);
    const sameMinute = useMemo(() => {
        const c = {};
        for (const r of rows) c[r.newTime] = (c[r.newTime] || 0) + 1;
        return c;
    }, [rows]);
    const editable = (l) => ["approved", "active"].includes(l.status);

    return (
        <section className="flex min-h-screen bg-gray-50">
            <AdminSidebar />
            <div className="w-full relative">
                <AdminHeader />
                <AdminContainer>
                    <div className="pt-16 md:pt-0 pb-10 max-w-6xl">
                        <h1 className="text-3xl font-bold my-5">Sale Night Times</h1>
                        <p className="text-sm text-gray-600 mb-4">
                            Change when lots close on a sale day (Irish time). Change times in the table or paste a plan,
                            press <strong>Check changes</strong> to see exactly what moves, then <strong>Apply</strong>.
                            Lots closing within 30 minutes can't be moved. Several lots can close at the same minute.
                        </p>

                        <div className="flex flex-wrap items-end gap-3 mb-5">
                            <label className="text-sm">
                                <span className="block text-gray-600 mb-1">Sale day</span>
                                <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="border rounded-md px-3 py-2" />
                            </label>
                            <button
                                type="button"
                                onClick={() => { setParams({ day }); load(day); }}
                                className="flex items-center gap-2 px-4 py-2 rounded-md bg-black text-white"
                            >
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Load lots
                            </button>
                            <span className="text-sm text-gray-600">{lots.length} lot(s) closing that day</span>
                        </div>

                        <details className="mb-5 bg-white border rounded-lg p-4">
                            <summary className="cursor-pointer font-medium">Paste a plan</summary>
                            <p className="text-xs text-gray-500 my-2">One lot per line with its listing ID and the new time, e.g. <code>19:30  6af24988e0ff5d59a69f30b3  Prodig</code>. Other text on the line is ignored.</p>
                            <textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={8} className="w-full border rounded-md p-2 font-mono text-xs" />
                            <button type="button" onClick={fillFromPlan} disabled={!plan.trim() || !lots.length} className="mt-2 px-4 py-2 rounded-md border bg-white disabled:opacity-40">
                                Fill in times from plan
                            </button>
                        </details>

                        <div className="overflow-x-auto bg-white border rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-left text-gray-600">
                                    <tr>
                                        <th className="p-2">Closes now</th>
                                        <th className="p-2">New time</th>
                                        <th className="p-2">Lot</th>
                                        <th className="p-2">Type</th>
                                        <th className="p-2">Bids</th>
                                        <th className="p-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((l) => {
                                        const changed = l.newTime !== l.time;
                                        return (
                                            <tr key={l.id} className={`border-t ${changed ? "bg-amber-50" : ""}`}>
                                                <td className="p-2 tabular-nums text-gray-500">{l.time}</td>
                                                <td className="p-2">
                                                    <input
                                                        type="time"
                                                        value={l.newTime}
                                                        disabled={!editable(l)}
                                                        onChange={(e) => setTime(l.id, e.target.value)}
                                                        className={`border rounded px-2 py-1 tabular-nums ${changed ? "border-amber-500" : ""}`}
                                                    />
                                                    {sameMinute[l.newTime] > 1 && <span className="ml-2 text-xs text-blue-700">×{sameMinute[l.newTime]}</span>}
                                                </td>
                                                <td className="p-2">
                                                    <Link to={`/auction/${l.id}`} target="_blank" className="hover:underline">{l.title}</Link>
                                                    <div className="text-xs text-gray-400">{(l.categories || []).slice(1).join(", ")}</div>
                                                </td>
                                                <td className="p-2 text-xs">{l.hasReserve ? "Reserve" : "No reserve"}</td>
                                                <td className="p-2">{l.bidCount}</td>
                                                <td className="p-2 text-xs">{l.status.replace(/_/g, " ")}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="sticky bottom-0 bg-gray-50 border-t mt-4 py-3 flex flex-wrap items-center gap-3">
                            <span className="text-sm"><Clock size={14} className="inline mr-1" />{changes.length} change(s)</span>
                            <button type="button" onClick={runCheck} disabled={!changes.length || checking} className="px-4 py-2 rounded-md border bg-white disabled:opacity-40">
                                {checking ? "Checking..." : "Check changes"}
                            </button>
                            <button
                                type="button"
                                onClick={apply}
                                disabled={!check || check.errors.length > 0 || !check.updates.length || applying}
                                className="px-4 py-2 rounded-md bg-[#D19F3E] text-black font-semibold disabled:opacity-40"
                            >
                                {applying ? "Applying..." : "Apply"}
                            </button>
                        </div>

                        {check && (
                            <div className="mt-3 bg-white border rounded-lg p-4 text-sm">
                                {check.errors.length > 0 ? (
                                    <>
                                        <p className="font-medium text-red-700 mb-2">Nothing will be changed until these are fixed:</p>
                                        <ul className="list-disc pl-5 text-red-700 space-y-1">{check.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                                    </>
                                ) : (
                                    <>
                                        <p className="font-medium text-green-700 mb-2 flex items-center gap-1"><CheckCircle2 size={16} /> All good. {check.updates.length} lot(s) will move:</p>
                                        <ul className="space-y-0.5 max-h-72 overflow-y-auto">
                                            {check.updates.map((u) => <li key={u.id} className="tabular-nums">{u.from} → <strong>{u.to}</strong> · {u.title}</li>)}
                                        </ul>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </AdminContainer>
            </div>
        </section>
    );
};

export default SaleTimes;
