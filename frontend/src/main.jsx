import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import RouteSeo from './components/RouteSeo';
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PopUpContextProvider } from './contexts/PopUpContextProvider';
import { Protected, LoadingSpinner, AdminRoute } from './components';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { isNativeApp, IS_APP_BUILD } from './native/platform';
import NativeBridge from './components/native/NativeBridge';

const Home = lazy(() => import('./pages/Home'));
const Contact = lazy(() => import('./pages/Contact'));
const About = lazy(() => import('./pages/About'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Auctions = lazy(() => import('./pages/Auctions'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfUse = lazy(() => import('./pages/TermsOfUse'));
const TermsConditions = lazy(() => import('./pages/TermsConditions'));
const PaymentRefundPolicy = lazy(() => import('./pages/PaymentRefundPolicy'));
const SellerAgreement = lazy(() => import('./pages/SellerAgreement'));
const BuyerAgreement = lazy(() => import('./pages/BuyerAgreement'));
const BuyerTerms = lazy(() => import('./pages/BuyerTerms'));
const SingleAuction = lazy(() => import('./pages/SingleAuction'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const FAQs = lazy(() => import('./pages/FAQs'));
const Checkout = lazy(() => import('./pages/Checkout'));
const SellerReviews = lazy(() => import('./pages/SellerReviews'));
const Sell = lazy(() => import('./pages/Sell'));
const DeliveryPartnerQuote = lazy(() => import('./pages/DeliveryPartnerQuote'));
const Unsubscribe = lazy(() => import('./pages/Unsubscribe'));
const SingleCatalogue = lazy(() => import('./pages/SingleCatalogue'));
const Catalogues = lazy(() => import('./pages/Catalogues'));
const BuyItNow = lazy(() => import('./pages/BuyItNow'));
const Notifications = lazy(() => import('./pages/Notifications'));
const AdminOnWebsite = lazy(() => import('./pages/AdminOnWebsite'));
const DeleteAccount = lazy(() => import('./pages/DeleteAccount'));
const RateUs = lazy(() => import('./pages/RateUs'));
const Reviews = lazy(() => import('./pages/WhatOurClientsSay'));
const NotFound = lazy(() => import('./pages/NotFound'));

{/* Seller Pages */ }
const SellerLayout = lazy(() => import('./pages/seller/Layout'));
const SellerDashboard = lazy(() => import('./pages/seller/Dashboard'));
const CreateAuctionSeller = lazy(() => import('./pages/seller/CreateAuction'));
const EditAuctionSeller = lazy(() => import('./pages/seller/EditAuction'));
const SellerAllAuctions = lazy(() => import('./pages/seller/AllAuctions'));
const SellerAllOffers = lazy(() => import('./pages/seller/AllOffers'));
const SoldAuctionsSeller = lazy(() => import('./pages/seller/SoldAuctions'));
const BidHistorySeller = lazy(() => import('./pages/seller/BidHistory'));
const SellerProfile = lazy(() => import('./pages/seller/Profile'));
const SellerNotifications = lazy(() => import('./pages/seller/Notifications'));
const SellerBilling = lazy(() => import('./pages/seller/Billing'));
const SellerPayoutMethods = lazy(() => import('./pages/seller/PayoutMethods'));
const SellerPayouts = lazy(() => import('./pages/seller/Payouts'));
const SellerDocuments = lazy(() => import('./pages/seller/Documents'));

{/* Company Pages */ }
const CompanyLayout = lazy(() => import('./pages/company/Layout'));
const CompanyDashboard = lazy(() => import('./pages/company/Dashboard'));
const CreateAuctionCompany = lazy(() => import('./pages/company/CreateAuction'));
const EditAuctionCompany = lazy(() => import('./pages/company/EditAuction'));
const CompanyAllAuctions = lazy(() => import('./pages/company/AllAuctions'));
const CompanyAllOffers = lazy(() => import('./pages/company/AllOffers'));
const SoldAuctionsCompany = lazy(() => import('./pages/company/SoldAuctions'));
const BidHistoryCompany = lazy(() => import('./pages/company/BidHistory'));
const CompanyProfile = lazy(() => import('./pages/company/Profile'));
const CompanyNotifications = lazy(() => import('./pages/company/Notifications'));
const CompanyBilling = lazy(() => import('./pages/company/Billing'));
const CompanyPayoutMethods = lazy(() => import('./pages/company/PayoutMethods'));
const CompanyPayouts = lazy(() => import('./pages/company/Payouts'));
const CompanyDocuments = lazy(() => import('./pages/company/Documents'));

{/* Broker Pages */ }
const BrokerLayout = lazy(() => import('./pages/broker/Layout'));
const BrokerDashboard = lazy(() => import('./pages/broker/Dashboard'));
const CreateAuctionBroker = lazy(() => import('./pages/broker/CreateAuction'));
const EditAuctionBroker = lazy(() => import('./pages/broker/EditAuction'));
const BrokerAllAuctions = lazy(() => import('./pages/broker/AllAuctions'));
const BrokerAllOffers = lazy(() => import('./pages/broker/AllOffers'));
const SoldAuctionsBroker = lazy(() => import('./pages/broker/SoldAuctions'));
const BidHistoryBroker = lazy(() => import('./pages/broker/BidHistory'));
const BrokerProfile = lazy(() => import('./pages/broker/Profile'));
const BrokerNotifications = lazy(() => import('./pages/broker/Notifications'));
const BrokerBilling = lazy(() => import('./pages/broker/Billing'));

{/* Bidder Pages */ }
const BidderLayout = lazy(() => import('./pages/bidder/Layout'));
const BidderDashboard = lazy(() => import('./pages/bidder/Dashboard'));
const Watchlist = lazy(() => import('./pages/bidder/Watchlist'));
const ActiveAuctions = lazy(() => import('./pages/bidder/ActiveAuctions'));
const MyBids = lazy(() => import('./pages/bidder/MyBids'));
const MyOffers = lazy(() => import('./pages/bidder/MyOffers'));
const WonAuctions = lazy(() => import('./pages/bidder/WonAuctions'));
const BidderDocuments = lazy(() => import('./pages/bidder/Documents'));
const BidderProfile = lazy(() => import('./pages/bidder/Profile'));
const BidderNotifications = lazy(() => import('./pages/bidder/Notifications'));
const BidderBilling = lazy(() => import('./pages/bidder/Billing'));

{/* Admin Pages */ }
const AdminLayout = lazy(() => import('./pages/admin/Layout'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AllUsers = lazy(() => import('./pages/admin/AllUsers'));
const PilotUsers = lazy(() => import('./pages/admin/PilotUsers'));
const AdminAllAuctions = lazy(() => import('./pages/admin/AllAuctions'));
const AdminCreateAuction = lazy(() => import('./pages/admin/CreateAuction'));
const AdminEditAuction = lazy(() => import('./pages/admin/EditAuction'));
const UserQueries = lazy(() => import('./pages/admin/UserQueries'));
const AdminNotifications = lazy(() => import('./pages/admin/Notifications'));
const AdminProfile = lazy(() => import('./pages/admin/Profile'));
const AdminComments = lazy(() => import('./pages/admin/Comments'));
const Commissions = lazy(() => import('./pages/admin/Commissions'));
const AdminBidHistory = lazy(() => import('./pages/admin/BidHistory'));
const AdminAllOffers = lazy(() => import('./pages/admin/AllOffers'));
const Transactions = lazy(() => import('./pages/admin/Transactions'));
const Categories = lazy(() => import('./pages/admin/Categories'));
const AdminPayouts = lazy(() => import('./pages/admin/Payouts'));
const AdminSales = lazy(() => import('./pages/admin/Sales'));
const AdminBuyItNow = lazy(() => import('./pages/admin/BuyItNow'));
const AdminPayoutMethods = lazy(() => import('./pages/admin/PayoutMethods'));
const AuctionDates = lazy(() => import('./pages/admin/AuctionDates'));
const EmailHealth = lazy(() => import('./pages/admin/EmailHealth'));
const AdminReminders = lazy(() => import('./pages/admin/AdminReminders'));
const DeliveryQuotes = lazy(() => import('./pages/admin/DeliveryQuotes'));
const AdminReviews = lazy(() => import('./pages/admin/Reviews'));
const AdminEmailCampaigns = lazy(() => import('./pages/admin/EmailCampaigns'));
const AdminAllCatalogues = lazy(() => import('./pages/admin/AllCatalogues'));
const AdminWebsiteReviews = lazy(() => import('./pages/admin/WebsiteReviews'));

// iPhone / Android app start-up (status bar, links, push notifications).
if (isNativeApp) {
    import('./native/init').then((m) => m.initNativeApp()).catch((err) => console.error('App start-up failed', err));
}

createRoot(document.getElementById('root')).render(
    //<StrictMode>
    <AuthProvider>
        <PopUpContextProvider>
            <BrowserRouter>
                {/* Sets the tab title and meta tags for every page, dashboards included. */}
                <RouteSeo />
                {isNativeApp && <NativeBridge />}
                <Routes>
                    <Route path='/' element={<App />}>
                        <Route path='' index={true} element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><Home /></Suspense>} />

                        <Route path='/contact' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><Contact /></Suspense>} />

                        <Route path='/about' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><About /></Suspense>} />

                        <Route path='/faqs' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><FAQs /></Suspense>} />

                        <Route path='/login' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><Login /></Suspense>} />

                        <Route path='/register' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><Register /></Suspense>} />

                        <Route path='/auctions' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><Auctions /></Suspense>} />

                        <Route path='/checkout/:auctionId' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><Checkout /></Suspense>} />

                        <Route path='/auction/:id' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><SingleAuction /></Suspense>} />

                        <Route path='/privacy-policy' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><PrivacyPolicy /></Suspense>} />

                        <Route path='/terms-conditions' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><TermsConditions /></Suspense>} />

                        {/* <Route path='/terms-of-use' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><TermsOfUse /></Suspense>} /> */}
                        {/* The register form links to /terms-of-use; send it to the live terms. */}
                        <Route path='/terms-of-use' element={<Navigate to='/terms-conditions' replace />} />
                        {/* Browsers that cached a temporary 301 to /index.html land here; send them home. */}
                        <Route path='/index.html' element={<Navigate to='/' replace />} />

                        <Route path='/payment-refund-policy' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><PaymentRefundPolicy /></Suspense>} />

                        <Route path='/seller-agreement' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><SellerAgreement /></Suspense>} />

                        <Route path='/buyer-agreement' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><BuyerAgreement /></Suspense>} />

                        <Route path='/buyer-terms' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><BuyerTerms /></Suspense>} />

                        <Route path="/seller-reviews/:userId" element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><SellerReviews /></Suspense>} />

                        <Route path='/reset-password' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><ResetPassword /></Suspense>} />

                        <Route path='/sell' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><Sell /></Suspense>} />

                        <Route path='/delivery-partner-quote' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><DeliveryPartnerQuote /></Suspense>} />

                        <Route path='/unsubscribe/:token' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><Unsubscribe /></Suspense>} />

                        <Route path='/catalogue/:id' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><SingleCatalogue /></Suspense>} />

                        <Route path='/catalogues' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><Catalogues /></Suspense>} />

                        <Route path='/buy-it-now' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><BuyItNow /></Suspense>} />

                        <Route path='/notifications' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><Notifications /></Suspense>} />

                        <Route path='/delete-account' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><DeleteAccount /></Suspense>} />

                        <Route path='/rate-us' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><RateUs /></Suspense>} />

                        <Route path='/reviews' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><Reviews /></Suspense>} />

                        {/* Unknown URLs: show a real "not found" page marked noindex. */}
                        <Route path='*' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><NotFound /></Suspense>} />
                    </Route>

                    {/* Seller Layout */}
                    <Route path='/seller' element={<Protected authetication={true} userType='seller'><SellerLayout /></Protected>}>
                        {/* Seller Dashboard */}
                        <Route
                            path='/seller/dashboard'
                            index={true}
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <SellerDashboard />
                                </Suspense>
                            }
                        />
                        {/* Seller Create Auction */}
                        <Route
                            path='/seller/auctions/create'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <CreateAuctionSeller />
                                </Suspense>
                            }
                        />
                        {/* Seller Edit Auction */}
                        <Route
                            path='/seller/auctions/edit/:auctionId'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <EditAuctionSeller />
                                </Suspense>
                            }
                        />
                        {/* Seller Live Auctions */}
                        <Route
                            path='/seller/auctions/all'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <SellerAllAuctions />
                                </Suspense>
                            }
                        />
                        {/* Seller All Offers */}
                        <Route
                            path='/seller/offers/all'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <SellerAllOffers />
                                </Suspense>
                            }
                        />
                        {/* Seller Won Auctions */}
                        <Route
                            path='/seller/auctions/sold'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <SoldAuctionsSeller />
                                </Suspense>
                            }
                        />
                        {/* Seller Auctions Bid History */}
                        <Route
                            path='/seller/bids/history'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <BidHistorySeller />
                                </Suspense>
                            }
                        />
                        {/* Seller Payout methods */}
                        <Route
                            path='/seller/payout-methods'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <SellerPayoutMethods />
                                </Suspense>
                            }
                        />

                        {/* Seller Payouts */}
                        <Route
                            path='/seller/documents'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <SellerDocuments />
                                </Suspense>
                            }
                        />
                        <Route
                            path='/seller/payouts'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <SellerPayouts />
                                </Suspense>
                            }
                        />

                        {/* Seller Profile */}
                        <Route
                            path='/seller/profile'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <SellerProfile />
                                </Suspense>
                            }
                        />
                        {/* Seller Notifications */}
                        {/* <Route
                                path='/seller/notifications'
                                element={
                                    <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                        <SellerNotifications />
                                    </Suspense>
                                }
                            /> */}

                        {/* Seller Billing */}
                        <Route
                            path='/seller/billing'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <SellerBilling />
                                </Suspense>
                            }
                        />
                    </Route>

                    {/* Company Layout */}
                    <Route path='/company' element={<Protected authetication={true} userType='company'><CompanyLayout /></Protected>}>
                        {/* Company Dashboard */}
                        <Route
                            path='/company/dashboard'
                            index={true}
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <CompanyDashboard />
                                </Suspense>
                            }
                        />
                        {/* Company Create Auction */}
                        <Route
                            path='/company/auctions/create'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <CreateAuctionCompany />
                                </Suspense>
                            }
                        />
                        {/* Company Edit Auction */}
                        <Route
                            path='/company/auctions/edit/:auctionId'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <EditAuctionCompany />
                                </Suspense>
                            }
                        />
                        {/* Company Live Auctions */}
                        <Route
                            path='/company/auctions/all'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <CompanyAllAuctions />
                                </Suspense>
                            }
                        />
                        {/* Company All Offers */}
                        <Route
                            path='/company/offers/all'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <CompanyAllOffers />
                                </Suspense>
                            }
                        />
                        {/* Company Won Auctions */}
                        <Route
                            path='/company/auctions/sold'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <SoldAuctionsCompany />
                                </Suspense>
                            }
                        />
                        {/* Company Auctions Bid History */}
                        <Route
                            path='/company/bids/history'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <BidHistoryCompany />
                                </Suspense>
                            }
                        />
                        {/* Company Payout methods */}
                        <Route
                            path='/company/payout-methods'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <CompanyPayoutMethods />
                                </Suspense>
                            }
                        />

                        {/* Company Payouts */}
                        <Route
                            path='/company/documents'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <CompanyDocuments />
                                </Suspense>
                            }
                        />
                        <Route
                            path='/company/payouts'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <CompanyPayouts />
                                </Suspense>
                            }
                        />

                        {/* Company Profile */}
                        <Route
                            path='/company/profile'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <CompanyProfile />
                                </Suspense>
                            }
                        />
                        {/* Company Notifications */}
                        {/* <Route
                                path='/company/notifications'
                                element={
                                    <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                        <CompanyNotifications />
                                    </Suspense>
                                }
                            /> */}

                        {/* Company Billing */}
                        <Route
                            path='/company/billing'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <CompanyBilling />
                                </Suspense>
                            }
                        />
                    </Route>

                    {/* Broker Layout */}
                    <Route path='/broker' element={<Protected authetication={true} userType='broker'><BrokerLayout /></Protected>}>
                        {/* Broker Dashboard */}
                        <Route
                            path='/broker/dashboard'
                            index={true}
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <BrokerDashboard />
                                </Suspense>
                            }
                        />
                        {/* Broker Create Auction */}
                        <Route
                            path='/broker/auctions/create'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <CreateAuctionBroker />
                                </Suspense>
                            }
                        />
                        {/* Broker Edit Auction */}
                        <Route
                            path='/broker/auctions/edit/:auctionId'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <EditAuctionBroker />
                                </Suspense>
                            }
                        />
                        {/* Broker Live Auctions */}
                        <Route
                            path='/broker/auctions/all'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <BrokerAllAuctions />
                                </Suspense>
                            }
                        />
                        {/* Broker All Offers */}
                        <Route
                            path='/broker/offers/all'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <BrokerAllOffers />
                                </Suspense>
                            }
                        />
                        {/* Broker Won Auctions */}
                        <Route
                            path='/broker/auctions/sold'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <SoldAuctionsBroker />
                                </Suspense>
                            }
                        />
                        {/* Broker Auctions Bid History */}
                        <Route
                            path='/broker/bids/history'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <BidHistoryBroker />
                                </Suspense>
                            }
                        />
                        {/* Broker Profile */}
                        <Route
                            path='/broker/profile'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <BrokerProfile />
                                </Suspense>
                            }
                        />
                        {/* Broker Notifications */}
                        {/* <Route
                                path='/broker/notifications'
                                element={
                                    <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                        <BrokerNotifications />
                                    </Suspense>
                                }
                            /> */}

                        {/* Broker Billing */}
                        {/* <Route
                                path='/broker/billing'
                                element={
                                    <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                        <BrokerBilling />
                                    </Suspense>
                                }
                            /> */}
                    </Route>

                    {/* Bidder Layout */}
                    <Route path='/bidder' element={<Protected authetication={true} userType='bidder'><BidderLayout /></Protected>}>
                        {/* Bidder Dashboard */}
                        <Route
                            path='/bidder/dashboard'
                            index={true}
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <BidderDashboard />
                                </Suspense>
                            }
                        />

                        {/* Bidder Watchlist */}
                        <Route
                            path='/bidder/watchlist'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <Watchlist />
                                </Suspense>
                            }
                        />

                        {/* Bidder Watchlist */}
                        <Route
                            path='/bidder/auctions/active'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <ActiveAuctions />
                                </Suspense>
                            }
                        />

                        {/* Bidder My Bids */}
                        <Route
                            path='/bidder/bids'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <MyBids />
                                </Suspense>
                            }
                        />

                        {/* Bidder My Offers */}
                        <Route
                            path='/bidder/offers'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <MyOffers />
                                </Suspense>
                            }
                        />

                        {/* Bidder My Bids */}
                        <Route
                            path='/bidder/auctions/won'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <WonAuctions />
                                </Suspense>
                            }
                        />
                        {/* Bidder Documents */}
                        <Route
                            path='/bidder/documents'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <BidderDocuments />
                                </Suspense>
                            }
                        />

                        {/* Bidder Profile */}
                        <Route
                            path='/bidder/profile'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <BidderProfile />
                                </Suspense>
                            }
                        />

                        {/* Bidder Notifications */}
                        {/* <Route
                                path='/bidder/notifications'
                                element={
                                    <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                        <BidderNotifications />
                                    </Suspense>
                                }
                            /> */}

                        {/* Bidder Billing */}
                        <Route
                            path='/bidder/billing'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <BidderBilling />
                                </Suspense>
                            }
                        />
                    </Route>

                    {/* Admin Layout */}
                    {/* The admin dashboard is website-only: it is left out of the app build. */}
                    {IS_APP_BUILD ? (
                        <Route path='/admin/*' element={<Suspense fallback={<LoadingSpinner height={'725px'} />}><AdminOnWebsite /></Suspense>} />
                    ) : (
                    <Route path='/admin' element={<Protected authetication={true} userType='admin'><AdminLayout /></Protected>} >
                        {/* Admin Dashboard */}
                        <Route
                            path='/admin/dashboard'
                            index={true}
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminDashboard />
                                </Suspense>
                            }
                        />

                        {/* Admin Buy It Now */}
                        <Route
                            path='/admin/buy-it-now'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminBuyItNow />
                                </Suspense>
                            }
                        />

                        {/* Admin Sales */}
                        <Route
                            path='/admin/sales'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminSales />
                                </Suspense>
                            }
                        />

                        {/* Admin All Users */}
                        <Route
                            path='/admin/users'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AllUsers />
                                </Suspense>
                            }
                        />

                        {/* Admin Pilot Users */}
                        {/* <Route
                            path='/admin/pilot-users'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <PilotUsers />
                                </Suspense>
                            }
                        /> */}

                        {/* Admin All Auctions */}
                        <Route
                            path='/admin/auctions/all'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminAllAuctions />
                                </Suspense>
                            }
                        />

                        {/* Admin Email problems */}
                        <Route
                            path='/admin/email-health'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <EmailHealth />
                                </Suspense>
                            }
                        />

                        {/* Admin Auction Dates */}
                        <Route
                            path='/admin/auction-dates'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AuctionDates />
                                </Suspense>
                            }
                        />

                        {/* Admin All Auctions */}
                        <Route
                            path='/admin/auctions/create'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminCreateAuction />
                                </Suspense>
                            }
                        />

                        {/* Admin Edit Auction */}
                        <Route
                            path='/admin/auctions/edit/:auctionId'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminEditAuction />
                                </Suspense>
                            }
                        />

                        {/* Admin Categories */}
                        <Route
                            path='/admin/categories'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <Categories />
                                </Suspense>
                            }
                        />

                        {/* Admin Payouts */}
                        <Route
                            path='/admin/payouts'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminPayouts />
                                </Suspense>
                            }
                        />

                        {/* Admin Payout Methods */}
                        {/* <Route
                            path='/admin/payout-methods'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminPayoutMethods />
                                </Suspense>
                            }
                        /> */}

                        {/* Admin Support */}
                        <Route
                            path='/admin/support/inquiries'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <UserQueries />
                                </Suspense>
                            }
                        />

                        {/* Admin Notifications */}
                        {/* <Route
                                path='/admin/notifications'
                                element={
                                    <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                        <AdminNotifications />
                                    </Suspense>
                                }
                            /> */}

                        {/* Admin Profile */}
                        <Route
                            path='/admin/profile'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminProfile />
                                </Suspense>
                            }
                        />

                        {/* Admin Comments */}
                        <Route
                            path='/admin/comments'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminComments />
                                </Suspense>
                            }
                        />

                        {/* Admin Commissions */}
                        <Route
                            path='/admin/commissions'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <Commissions />
                                </Suspense>
                            }
                        />

                        {/* Admin Bids */}
                        <Route
                            path='/admin/bids'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminBidHistory />
                                </Suspense>
                            }
                        />

                        {/* Admin Offers */}
                        <Route
                            path='/admin/offers'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminAllOffers />
                                </Suspense>
                            }
                        />

                        {/* Admin Offers */}
                        <Route
                            path='/admin/interests'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminReminders />
                                </Suspense>
                            }
                        />

                        {/* Admin Offers */}
                        <Route
                            path='/admin/delivery-quotes'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <DeliveryQuotes />
                                </Suspense>
                            }
                        />

                        {/* Admin Reviews */}
                        <Route
                            path='/admin/seller-reviews'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminReviews />
                                </Suspense>
                            }
                        />
                        {/* Admin Email Campaigns */}
                        <Route
                            path='/admin/email-campaigns'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminEmailCampaigns />
                                </Suspense>
                            }
                        />
                        {/* Admin All Catalogue */}
                        <Route
                            path='/admin/catalogues'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminAllCatalogues />
                                </Suspense>
                            }
                        />
                        {/* Admin All Reviews */}
                        <Route
                            path='/admin/website-reviews'
                            element={
                                <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                    <AdminWebsiteReviews />
                                </Suspense>
                            }
                        />

                        {/* Admin Transactions */}
                        {/* <Route
                                path='/admin/transactions'
                                element={
                                    <Suspense fallback={<LoadingSpinner height={'750px'} />}>
                                        <Transactions />
                                    </Suspense>
                                }
                            /> */}
                    </Route>
                    )}
                </Routes>
            </BrowserRouter>
        </PopUpContextProvider>
    </AuthProvider>
    //</StrictMode>,
)
