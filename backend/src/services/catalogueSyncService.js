// Every sale date (Auction Dates) gets its catalogue on the home page
// automatically. A catalogue lists the lots that end on its closing day, so
// one is created per sale date: titled from the date ("Closing Thursday 19th
// November"), using the image of the most recent catalogue (change it in
// Admin › Catalogues). Dates that already have a catalogue are left alone.

import AuctionDate from "../models/auctionDate.model.js";
import Catalogue from "../models/catalogue.model.js";

const TZ = "Europe/Dublin";

/** Calendar day (YYYY-MM-DD) of a moment in Irish time. */
export const irishDayKey = (date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** "Closing Thursday 19th November" for a day key. */
export const catalogueTitleFor = (dayKey) => {
  const d = new Date(`${dayKey}T12:00:00Z`);
  const weekday = d.toLocaleDateString("en-IE", { weekday: "long", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-IE", { month: "long", timeZone: "UTC" });
  return `Closing ${weekday} ${ordinal(d.getUTCDate())} ${month}`;
};

/** Creates the catalogue for a sale date if its closing day has none. Returns it (or null). */
export const ensureCatalogueForSaleDate = async (saleDate, { createdBy = null } = {}) => {
  if (!saleDate?.endDate) return null;
  const key = irishDayKey(saleDate.endDate);
  const dayStart = new Date(`${key}T00:00:00.000Z`);
  const dayEnd = new Date(`${key}T23:59:59.999Z`);
  const existing = await Catalogue.findOne({ closingDate: { $gte: dayStart, $lte: dayEnd } });
  if (existing) return existing;

  const latest = await Catalogue.findOne({ "image.url": { $exists: true } }).sort({ createdAt: -1 });
  if (!latest?.image?.url) {
    console.warn(`No catalogue image to reuse; add a catalogue for ${key} in Admin › Catalogues.`);
    return null;
  }
  const created = await Catalogue.create({
    title: catalogueTitleFor(key),
    closingDate: dayStart, // same format as catalogues made in admin
    image: { url: latest.image.url, publicId: latest.image.publicId, filename: latest.image.filename || "" },
    createdBy: createdBy || saleDate.createdBy || null,
  });
  console.log(`Created catalogue "${created.title}" for sale date ${saleDate._id}`);
  return created;
};

/** Makes sure every active, upcoming sale date has a catalogue. Safe to run repeatedly. */
export const syncCataloguesForSaleDates = async (now = new Date()) => {
  const dates = await AuctionDate.find({ isActive: true, endDate: { $gte: now } });
  let created = 0;
  for (const d of dates) {
    const before = await Catalogue.countDocuments();
    await ensureCatalogueForSaleDate(d);
    if ((await Catalogue.countDocuments()) > before) created += 1;
  }
  return created;
};
