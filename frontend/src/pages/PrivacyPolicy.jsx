import { Link } from "react-router-dom";
import { Container } from "../components";
import { otherData } from "../assets";

const { email, address } = otherData;

const processingPurposes = [
    {
        purpose:
            "To verify User identity, register you as a new User whether as a seller or buyer, preventing fraud and maintaining Site security",
        data: ["Identity", "Contact"],
        basis: [
            "Performance of a contract with you",
            "Preventing fraud and maintaining Site security",
        ],
    },
    {
        purpose:
            "To process and deliver our Services including: (a) Manage payments, fees and charges (b) Managing listings, bids, and transactions (c) Collect and recover money owed to us",
        data: ["Identity", "Contact", "Financial", "Transaction", "Marketing and Communications"],
        basis: [
            "Performance of a contract with you",
            "Necessary for our legitimate interests (to recover debts due to us)",
        ],
    },
    {
        purpose:
            "To manage our relationship with you which will include: (a) Notifying you about changes to our Terms or Privacy Policy (b) Sending Services updates to Users (c) Asking Users to leave a review or take a survey",
        data: ["Identity", "Contact", "Profile", "Marketing and Communications"],
        basis: [
            "Performance of a contract with you",
            "Necessary to comply with our legal obligations",
            "Necessary for our legitimate interests (to keep our records updated and to study how customers use our products/services)",
        ],
    },
    {
        purpose: "To enable you to partake in a competition or complete a survey",
        data: ["Identity", "Contact", "Profile", "Usage", "Marketing and Communications"],
        basis: [
            "Performance of a contract with you",
            "Necessary for our legitimate interests (to study how Users use our Services, to develop them and grow our business)",
        ],
    },
    {
        purpose:
            "To administer and protect our business and this website (including troubleshooting, data analysis, testing, system maintenance, support, reporting and hosting of data)",
        data: ["Identity", "Contact", "Technical"],
        basis: [
            "Necessary for our legitimate interests (for running our business, provision of administration and IT services, network security, to prevent fraud and in the context of a business reorganisation or group restructuring exercise)",
            "Necessary to comply with a legal obligation",
        ],
    },
    {
        purpose:
            "To deliver relevant website content and advertisements to you and measure or understand the effectiveness of the advertising we serve to you",
        data: [
            "Identity",
            "Contact",
            "Profile",
            "Usage",
            "Marketing and Communications",
            "Technical",
        ],
        basis: [
            "Necessary for our legitimate interests (to study how customers use our products/services, to develop them, to grow our business and to inform our marketing strategy)",
        ],
    },
    {
        purpose:
            "To use data analytics to improve our website (Site), our Services, marketing, customer relationships and experiences",
        data: ["Technical", "Usage"],
        basis: [
            "Necessary for our legitimate interests (to define types of customers for our products and services, to keep our website updated and relevant, to develop our business and to inform our marketing strategy)",
        ],
    },
    {
        purpose:
            "To make suggestions and recommendations to you about goods or services that may be of interest to you",
        data: [
            "Identity",
            "Contact",
            "Technical",
            "Usage",
            "Profile",
            "Marketing and Communications",
        ],
        basis: [
            "Necessary for our legitimate interests (to develop our products/services and grow our business)",
        ],
    },
];

const PrivacyPolicy = () => {
    const formattedDate = "November 2026";

    return (
        <section className="pt-28 pb-16 bg-white">
            <Container>
                {/* Header */}
                <div className="max-w-full mx-auto mb-10">
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
                        Privacy Statement
                    </h1>
                    <p className="text-gray-600 mb-6">
                        REXBID Limited | Last Updated: {formattedDate}
                    </p>

                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
                        <p className="text-blue-800 font-semibold mb-2">IRISH MARKETPLACE</p>
                        <p className="text-blue-700 text-sm">
                            RexBid operates across Northern Ireland and the Republic of Ireland.
                            This statement explains how we collect, use, and protect your information
                            in accordance with Irish and EU data protection laws.
                        </p>
                    </div>
                </div>

                {/* Main Content */}
                <div className="max-w-full mx-auto">
                    <div className="space-y-8">

                        {/* Introduction */}
                        <div className="mb-8">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">Introduction</h2>

                            <p className="text-gray-700 mb-4">
                                Welcome to the REXBID Limited's (Rexbid) privacy statement on{" "}
                                <a
                                    href="https://www.rexbid.ie"
                                    className="text-blue-600 hover:underline break-all"
                                >
                                    https://www.rexbid.ie
                                </a>{" "}
                                (Site).
                            </p>

                            <p className="text-gray-700 mb-4">
                                Rexbid respects your privacy and is committed to protecting your personal
                                data. This privacy statement will inform you as to how we look after your
                                personal data when you visit our Site (regardless of where you visit it
                                from) and tell you about your privacy rights and how the law protects you.
                            </p>

                            <p className="text-gray-700 mb-4">
                                You can download a pdf version of the policy/privacy statement here:{" "}
                                <a
                                    href="https://rexbid.ie/privacyPolicy.pdf"
                                    className="text-blue-600 hover:underline break-all"
                                >
                                    https://rexbid.ie/privacyPolicy.pdf
                                </a>
                            </p>

                            <p className="text-gray-700">
                                Please use the{" "}
                                <a href="#glossary" className="text-blue-600 hover:underline">
                                    Glossary
                                </a>{" "}
                                near the end of this document to understand the meaning of some of the
                                terms used in this Privacy Statement/Privacy Policy.
                            </p>
                        </div>

                        {/* Section 1 */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">
                                1. Important Information and Who We Are
                            </h2>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">
                                Purpose of this privacy statement
                            </h3>

                            <p className="text-gray-700 mb-3">
                                This privacy statement aims to give you information on how Rexbid collects
                                and processes your personal data through your use of this Site, including
                                any data you may provide through this Site when you use our Services (as
                                defined).
                            </p>

                            <p className="text-gray-700 mb-3">
                                This Site is not intended for children and we do not knowingly collect data
                                relating to children.
                            </p>

                            <p className="text-gray-700 mb-3">
                                It is important that you read this privacy statement together with any other
                                privacy statement or fair processing policy we may provide on specific
                                occasions when we are collecting or processing personal data about you so
                                that you are fully aware of how and why we are using your data. This privacy
                                statement supplements other privacy statements and is not intended to
                                override them.
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">Controller</h3>

                            <p className="text-gray-700 mb-3">
                                REXBID Limited (Rexbid) having its registered office at Corfeehone, Poles,
                                Co. Cavan is the controller and responsible for your personal data
                                (collectively referred to as "the Company", "we", "us" or "our" or "Rexbid"
                                in this privacy statement).
                            </p>

                            <p className="text-gray-700 mb-3">
                                If you have any questions about this privacy statement, including any
                                requests to exercise your legal rights (described below), please contact us
                                using the details set out below.
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">Contact details</h3>

                            <div className="bg-gray-50 p-4 rounded mb-4">
                                <p className="text-gray-700 text-sm mb-1">
                                    <strong>Full name of legal entity:</strong> REXBID Limited
                                </p>
                                <p className="text-gray-700 text-sm mb-1">
                                    <strong>Email address:</strong>{" "}
                                    <a
                                        href={`mailto:${email}`}
                                        className="text-blue-600 hover:underline break-all"
                                    >
                                        {email}
                                    </a>
                                </p>
                                <p className="text-gray-700 text-sm mb-1">
                                    <strong>Postal address:</strong> {address}
                                </p>
                                <p className="text-gray-700 text-sm">
                                    <strong>Phone:</strong>{" "}
                                    <Link
                                        to={`tel:${otherData?.phoneCode}${otherData?.phone}`}
                                        className="hover:text-[#D19F3E] transition"
                                    >
                                        {otherData?.phoneCode} {otherData?.formatPhone(otherData?.phone)}
                                    </Link>
                                </p>
                            </div>

                            <p className="text-gray-700 mb-3">
                                You have the right to make a complaint at any time to the Data Protection
                                Commission (DPC), the Irish regulator for data protection issues (
                                <a
                                    href="https://www.dpc.ie"
                                    className="text-blue-600 hover:underline break-all"
                                >
                                    www.dpc.ie
                                </a>
                                ). We would, however, appreciate the chance to deal with your concerns
                                before you approach the DPC so please contact us in the first instance.
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">
                                Changes to the privacy statement and your duty to inform us of changes
                            </h3>

                            <p className="text-gray-700 mb-3">
                                We keep our privacy statement under regular review. This version is dated
                                August 2026. It is important that the personal data we hold about you is
                                accurate and current. Please keep us informed if your personal data changes
                                during your relationship with us.
                            </p>

                            <p className="text-gray-700 mb-3">
                                We may update this Privacy Statement from time to time to reflect changes in
                                our Services, legal obligations, or technology.
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">Third party links</h3>

                            <p className="text-gray-700">
                                This Site may include links to third-party websites, plug-ins and
                                applications. Clicking on those links or enabling those connections may
                                allow third parties to collect or share data about you. We do not control
                                these third-party websites, plug-ins and applications and are not
                                responsible for their privacy statements/privacy notices/privacy policies.
                                When you leave our Site, we encourage you to read the privacy
                                policy/privacy statement/privacy notice of every website you visit.
                            </p>
                        </div>

                        {/* Section 2 */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">
                                2. The Data We Collect About You
                            </h2>

                            <p className="text-gray-700 mb-3">
                                Personal data, or personal information, means any information about an
                                individual from which that person can be identified. It does not include
                                data where the identity has been removed (anonymous data).
                            </p>

                            <p className="text-gray-700 mb-3">
                                We may collect, use, store and transfer different kinds of personal data
                                about you which we have grouped together as follows:
                            </p>

                            <ul className="text-gray-700 space-y-2 list-disc pl-5">
                                <li>
                                    <strong>Identity Data</strong> includes first name, last name, or
                                    company name, username (email address) or similar identifier,
                                    beneficial ownership information (where legally required to be
                                    provided or obtained), and any other information which we are required
                                    to obtain from time to time in order to comply with applicable laws.
                                </li>
                                <li>
                                    <strong>Contact Data</strong> includes business address, billing
                                    address, delivery address, email address and telephone numbers.
                                </li>
                                <li>
                                    <strong>Financial Data</strong> includes bank account and debit and
                                    credit card details.
                                </li>
                                <li>
                                    <strong>Transaction Data</strong> includes details about payments to
                                    and from you and other details of products advertised on the Site and
                                    services you have purchased from us.
                                </li>
                                <li>
                                    <strong>Technical Data</strong> includes internet protocol (IP)
                                    address, device type, your login data, browser information and
                                    version, time zone setting and location, browser plug-in types and
                                    versions, operating system and platform, and other technology on the
                                    devices you use to access this Site.
                                </li>
                                <li>
                                    <strong>Profile Data</strong> includes whether User buyer or User
                                    seller, your username (email address) and password, listings, reserve
                                    price(s) for products, purchases or orders made by you for products,
                                    your interests, preferences, feedback and survey responses.
                                </li>
                                <li>
                                    <strong>Usage Data</strong> includes bids made, account activity,
                                    transaction history, communication records between users and with us,
                                    information about how you use our Site and our Services.
                                </li>
                                <li>
                                    <strong>Marketing and Communications Data</strong> includes your
                                    preferences in receiving marketing from us and our third parties and
                                    your communication preferences.
                                </li>
                            </ul>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">Aggregated Data</h3>

                            <p className="text-gray-700 mb-3">
                                We also collect, use and share Aggregated Data such as statistical or
                                demographic data for any purpose. Aggregated Data could be derived from
                                your personal data but is not considered personal data in law as this data
                                will not directly or indirectly reveal your identity. For example, we may
                                aggregate your Usage Data to calculate the percentage of users accessing a
                                specific Site feature. However, if we combine or connect Aggregated Data
                                with your personal data so that it can directly or indirectly identify you,
                                we treat the combined data as personal data which will be used in
                                accordance with this privacy statement.
                            </p>

                            <p className="text-gray-700 mb-3">
                                We do not collect any Special Categories of Personal Data about you (this
                                includes details about your race or ethnicity, religious or philosophical
                                beliefs, sex life, sexual orientation, political opinions, trade union
                                membership, information about your health, and genetic and biometric
                                data). Nor do we collect any information about criminal convictions and
                                offences.
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">
                                If you fail to provide personal data
                            </h3>

                            <p className="text-gray-700">
                                Where we need to collect personal data by law, or under the terms of an
                                agreement we have with you, and you fail to provide that data when
                                requested, we may not be able to perform the agreement we have or are
                                trying to enter into with you (for example, to provide you with our
                                Services). In this case, we may have to suspend or terminate our Services
                                (as defined in our Terms), but we will notify you if this is the case at
                                the time.
                            </p>
                        </div>

                        {/* Section 3 */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">
                                3. How Is Your Personal Data Collected?
                            </h2>

                            <p className="text-gray-700 mb-3">
                                We use different methods to collect data from and about you including
                                through:
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">
                                3.1 Direct interactions
                            </h3>

                            <p className="text-gray-700 mb-2">
                                You may give us your Identity, Contact and Financial Data by filling in
                                forms or by corresponding with us by post, phone, email or otherwise. This
                                includes personal data you provide when you:
                            </p>

                            <ul className="text-gray-700 space-y-1 list-disc pl-5 mb-3">
                                <li>apply to register on our Site;</li>
                                <li>create an account on our Site;</li>
                                <li>
                                    use our Services whether as a User seller or a User buyer or subscribe
                                    to a publication of ours;
                                </li>
                                <li>request marketing to be sent to you;</li>
                                <li>enter a competition, promotion or survey; or</li>
                                <li>give us feedback or contact us.</li>
                            </ul>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">
                                3.2 Automated technologies or interactions
                            </h3>

                            {/* <p className="text-gray-700 mb-3">
                                As you interact with our Site, we will automatically collect Technical Data
                                about your equipment, browsing actions, time spent and patterns. We collect
                                this personal data by using cookies, server logs and other similar
                                technologies. We may also receive Technical Data about you if you visit
                                other websites employing our cookies. Please see our cookie policy{" "}
                                <a
                                    href="https://www.rexbid.ie/cookies"
                                    className="text-blue-600 hover:underline break-all"
                                >
                                    https://www.rexbid.ie/cookies
                                </a>{" "}
                                for further details.
                            </p> */}

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">
                                3.3 Third parties or publicly available sources
                            </h3>

                            <p className="text-gray-700 mb-2">
                                We will receive personal data about you from various third parties and
                                public sources as set out below:
                            </p>

                            <ul className="text-gray-700 space-y-2 list-disc pl-5">
                                <li>
                                    <strong>3.3.1 Technical Data</strong> from the following parties:
                                    (a) analytics providers such as Google; (b) advertising networks such
                                    as Facebook, Instagram; (c) search information providers such as
                                    Google.
                                </li>
                                <li>
                                    <strong>3.3.2</strong> Contact, Financial and Transaction Data from
                                    providers of technical, payment and delivery services such as our
                                    designated payment services provider based outside Ireland.
                                </li>
                                <li>
                                    <strong>3.3.3</strong> Identity and Contact Data from data brokers or
                                    aggregators such as Stripe.
                                </li>
                                <li>
                                    <strong>3.3.4</strong> Identity and Contact Data from publicly
                                    available sources such as the Companies Registration Office and the
                                    Electoral Register based inside Ireland.
                                </li>
                                <li>
                                    <strong>3.3.5</strong> The Revenue Commissioners or credit reference
                                    agencies.
                                </li>
                            </ul>
                        </div>

                        {/* Section 4 */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">
                                4. How We Use Your Personal Data
                            </h2>

                            <p className="text-gray-700 mb-3">
                                We will only use your personal data when the law allows us to. Most
                                commonly, we will use your personal data in the following circumstances:
                            </p>

                            <ul className="text-gray-700 space-y-2 list-disc pl-5 mb-4">
                                <li>
                                    where we need to perform the contract/agreement we are about to enter
                                    into or have entered into with you;
                                </li>
                                <li>
                                    where it is necessary for our legitimate interests (or those of a
                                    third party) and your interests and fundamental rights do not override
                                    those interests;
                                </li>
                                <li>where we need to comply with a legal obligation.</li>
                            </ul>

                            <p className="text-gray-700 mb-3">
                                See under{" "}
                                <a href="#glossary" className="text-blue-600 hover:underline">
                                    GLOSSARY, LAWFUL BASIS
                                </a>{" "}
                                below to find out more about the types of lawful basis that we will rely
                                on to process your personal data.
                            </p>

                            <p className="text-gray-700 mb-4">
                                Generally, we do not rely on consent as a legal basis for processing your
                                personal data although we will get your consent before sending third party
                                direct marketing communications to you via email or text message. You have
                                the right to withdraw consent to marketing at any time by contacting us.
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">
                                Purposes for which we will use your personal data
                            </h3>

                            <p className="text-gray-700 mb-3">
                                We have set out below, in a table format, a description of all the ways we
                                plan to use your personal data, and which of the legal bases we rely on to
                                do so. We have also identified what our legitimate interests are where
                                appropriate.
                            </p>

                            <p className="text-gray-700 mb-4">
                                Note that we may process your personal data for more than one lawful ground
                                depending on the specific purpose for which we are using your data. Please
                                contact us if you need details about the specific legal ground we are
                                relying on to process your personal data where more than one ground has
                                been set out in the table below.
                            </p>

                            <div className="overflow-x-auto rounded border border-gray-200">
                                <table className="min-w-[760px] w-full text-left text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 font-semibold text-gray-900 border-b">
                                                Purpose / Activity
                                            </th>
                                            <th className="px-4 py-3 font-semibold text-gray-900 border-b">
                                                Type of Data
                                            </th>
                                            <th className="px-4 py-3 font-semibold text-gray-900 border-b">
                                                Lawful Basis for Processing (including basis of legitimate
                                                interest)
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-200">
                                        {processingPurposes.map((row, index) => (
                                            <tr key={index} className="align-top">
                                                <td className="px-4 py-3 text-gray-700">
                                                    {row.purpose}
                                                </td>

                                                <td className="px-4 py-3 text-gray-700">
                                                    <ul className="space-y-1">
                                                        {row.data.map((item, i) => (
                                                            <li key={i}>{item}</li>
                                                        ))}
                                                    </ul>
                                                </td>

                                                <td className="px-4 py-3 text-gray-700">
                                                    <ul className="space-y-1 list-disc pl-4">
                                                        {row.basis.map((item, i) => (
                                                            <li key={i}>{item}</li>
                                                        ))}
                                                    </ul>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Marketing */}
                            <h3 className="font-semibold text-gray-800 mb-2 mt-6">Marketing</h3>

                            <p className="text-gray-700 mb-3">
                                We strive to provide you with choices regarding certain personal data uses,
                                particularly around marketing and advertising.
                            </p>

                            <h4 className="font-semibold text-gray-800 mb-2 mt-4">
                                Promotional offers from us
                            </h4>

                            <p className="text-gray-700 mb-3">
                                We may use your Identity, Contact, Technical, Usage and Profile Data to
                                form a view on what we think you may want or need, or what may be of
                                interest to you. This is how we decide which products, services and offers
                                may be relevant for you (we call this marketing).
                            </p>

                            <p className="text-gray-700 mb-3">
                                You will receive marketing communications from us if you have requested
                                information from us or purchased our Services (as defined) and you have not
                                opted out of receiving that marketing.
                            </p>

                            <h4 className="font-semibold text-gray-800 mb-2 mt-4">
                                Third-party marketing
                            </h4>

                            <p className="text-gray-700 mb-3">
                                We will get your express opt-in consent before we share your personal data
                                with any third party for marketing purposes.
                            </p>

                            <h4 className="font-semibold text-gray-800 mb-2 mt-4">Opting out</h4>

                            <p className="text-gray-700 mb-3">
                                You can ask us or third parties to stop sending you marketing messages at
                                any time by following the opt-out links on any marketing message sent to
                                you or by contacting us at any time.
                            </p>

                            <p className="text-gray-700 mb-3">
                                Where you opt out of receiving these marketing messages, this will not
                                apply to personal data provided to us as a result of you purchasing our
                                Services or other transactions.
                            </p>

                            <p className="text-gray-700 mb-3">
                                You can choose which emails you receive in Profile &rarr; Notifications.
                                Emails about payments, auctions you&rsquo;ve won, accepted offers, your sales
                                and your account&rsquo;s security are always sent, because they are part of
                                the service.
                            </p>

                            {/* Cookies */}
                            {/* <h3 className="font-semibold text-gray-800 mb-2 mt-6">Cookies</h3>

                            <p className="text-gray-700 mb-3">
                                You can set your browser to refuse all or some browser cookies, or to alert
                                you when websites set or access cookies. If you disable or refuse cookies,
                                please note that some parts of this Site may become inaccessible or not
                                function properly. For more information about the cookies we use, please
                                see{" "}
                                <a
                                    href="https://www.rexbid.ie/cookies"
                                    className="text-blue-600 hover:underline break-all"
                                >
                                    https://www.rexbid.ie/cookies
                                </a>
                                .
                            </p> */}

                            {/* Change of purpose */}
                            <h3 className="font-semibold text-gray-800 mb-2 mt-6">
                                Change of purpose
                            </h3>

                            <p className="text-gray-700 mb-3">
                                We will only use your personal data for the purposes for which we collected
                                it, unless we reasonably consider that we need to use it for another reason
                                and that reason is compatible with the original purpose. If you wish to get
                                an explanation as to how the processing for the new purpose is compatible
                                with the original purpose, please contact us. If we need to use your
                                personal data for an unrelated purpose, we will notify you and we will
                                explain the legal basis which allows us to do so. Please note that we may
                                process your personal data without your knowledge or consent, in compliance
                                with the above rules, where this is required or permitted by law.
                            </p>

                            <p className="text-gray-700 mb-3">
                                We may also share your personal data where you have consented to us doing
                                so.
                            </p>

                            <p className="text-gray-700">
                                Any such disclosures will comply with our obligations under applicable data
                                protection laws. Some of these parties may process your personal data in
                                accordance with our instructions and others will themselves be responsible
                                for their use of your personal data.
                            </p>
                        </div>

                        {/* Section 5 */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">
                                5. Disclosures of Your Personal Data
                            </h2>

                            <p className="text-gray-700 mb-3">
                                We may disclose your personal data to other organisations in connection
                                with the above purposes, including:
                            </p>

                            <ul className="text-gray-700 space-y-2 list-disc pl-5 mb-3">
                                <li>
                                    (i) to third parties who we engage to provide services to us in
                                    connection with this Site and our systems, such as outsourced service
                                    providers, IT services providers, professional advisers and auditors;
                                </li>
                                <li>
                                    (ii) to third party advertisers to assist in the display of
                                    advertisements on third party sites and tracking the effectiveness of
                                    our advertisements;
                                </li>
                                <li>
                                    (iii) to competent regulatory authorities and bodies as requested or
                                    required by law including the Revenue Commissioners;
                                </li>
                                <li>
                                    (iv) to market researchers, fraud prevention agencies, price
                                    comparison sites and so on;
                                </li>
                                <li>
                                    (v) third parties to whom we may choose to sell, transfer or merge
                                    parts of our business or our assets.
                                </li>
                            </ul>

                            <p className="text-gray-700 mb-3">
                                Alternatively, we may seek to acquire other businesses or merge with them.
                                If a change happens to our business, then the new owners may use your
                                personal data in the same way as set out in this privacy policy.
                            </p>

                            <p className="text-gray-700 mb-3">
                                We may also share your personal data where you have consented to us doing
                                so.
                            </p>

                            <p className="text-gray-700">
                                Any such disclosures will comply with our obligations under applicable data
                                protection laws. Some of these parties may process your personal data in
                                accordance with our instructions and others will themselves be responsible
                                for their use of your personal data.
                            </p>
                        </div>

                        {/* Section 6 */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">
                                6. International Transfers
                            </h2>

                            <p className="text-gray-700">
                                Where relevant and necessary for our business we may transfer your personal
                                data outside the European Economic Area, including to a jurisdiction which
                                is not recognised by the European Commission as providing for an equivalent
                                level of protection for personal data as is provided for in the European
                                Union. If and to the extent that we do so, we will ensure that appropriate
                                measures are in place to comply with our obligations under applicable law
                                governing such transfers, which may include: (i) entering into a contract
                                governing the transfer which contains the 'standard contractual clauses'
                                approved for this purpose by the European Commission or (ii) seeking and
                                obtaining your explicit consent to the transfer or (iii) where the transfer
                                is necessary for the establishment, exercise or defence of legal claims.
                            </p>
                        </div>

                        {/* Our mobile app (added November 2026) */}
                        <div className="border-t pt-6" id="mobile-app">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">Our Mobile App</h2>

                            <p className="text-gray-700 mb-3">
                                RexBid has an app for iPhone and Android. It uses the same account and
                                services as rexbid.ie, and this privacy policy applies to it in the same
                                way. The app also uses the following.
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">Push notifications</h3>
                            <p className="text-gray-700 mb-3">
                                If you allow notifications, your phone gives us a notification token (a
                                random identifier for the app on your phone, provided by Google Firebase
                                Cloud Messaging and, on iPhone, Apple&rsquo;s push service). We store it with
                                your account so we can tell you when you&rsquo;re outbid, when lots end, when
                                you win, about payments, questions and your sales. We delete it when you
                                sign out or delete your account, or when it stops working. You can choose
                                which notifications you get in Profile &rarr; Notifications, or turn them all
                                off in your phone&rsquo;s Settings. Notifications are also kept in the
                                app&rsquo;s Alerts list for 90 days.
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">Face ID, Touch ID and fingerprint sign-in</h3>
                            <p className="text-gray-700 mb-3">
                                If you turn this on, your email and password are stored only on your phone,
                                in its secure storage (the iPhone Keychain or Android Keystore), and unlocked
                                by your phone&rsquo;s own face or fingerprint check. We never receive your face
                                or fingerprint data. You can turn this off at any time by signing in with your
                                password and declining, or by removing the app.
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">Camera and photos</h3>
                            <p className="text-gray-700 mb-3">
                                The app asks for access to your camera and photos only when you choose to add
                                photos to a listing. Only the photos you pick are uploaded, as part of your
                                listing.
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">Staying signed in</h3>
                            <p className="text-gray-700 mb-3">
                                The app keeps you signed in on that phone (for up to 90 days without use) so
                                you don&rsquo;t miss notifications. On the website you can choose &ldquo;Keep me
                                signed in&rdquo;.
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">No advertising tracking</h3>
                            <p className="text-gray-700 mb-3">
                                The app does not use advertising identifiers, Google Analytics or the Meta
                                Pixel, and does not track you across other companies&rsquo; apps or websites.
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">Service providers for the app</h3>
                            <p className="text-gray-700">
                                Google (Firebase Cloud Messaging) and Apple (Apple Push Notification service)
                                deliver notifications on our behalf. Payments in the app are handled by
                                Stripe, as on the website.
                            </p>
                        </div>

                        {/* Section 7 */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">7. Data Security</h2>

                            <p className="text-gray-700 mb-3">
                                We have put in place appropriate security measures to prevent your personal
                                data from being accidentally lost, used or accessed in an unauthorised way,
                                altered or disclosed. In addition, we limit access to your personal data to
                                those employees, agents, contractors and other third parties who have a
                                business need to know. They will only process your personal data on our
                                instructions and they are subject to a duty of confidentiality.
                            </p>

                            <p className="text-gray-700 mb-3">
                                We have put in place procedures to deal with any suspected personal data
                                breach and will notify you and any applicable regulator of a breach where
                                we are legally required to do so.
                            </p>

                            <div className="bg-gray-50 p-4 rounded mb-3">
                                <p className="text-gray-600 text-sm mb-2">
                                    However note as follows: communications over the internet (such as
                                    emails) are not secure unless they've been encrypted. We cannot accept
                                    responsibility for any unauthorised access or loss of personal
                                    information that is beyond our control. We will not ask you for your
                                    secure personal or account information by an unsolicited means of
                                    communication. You are responsible for keeping your personal and
                                    account information secure and not sharing it with others.
                                </p>

                                <p className="text-gray-600 text-sm mb-2">
                                    Our Site may provide links to third-party websites. We cannot be
                                    responsible for the security and content of such third-party websites.
                                    So make sure you read that company's privacy and cookies policies
                                    before using or putting your personal information on any third party
                                    website.
                                </p>

                                <p className="text-gray-600 text-sm mb-2">
                                    The same applies to any third-party websites or content you connect to
                                    using our services.
                                </p>

                                <p className="text-gray-600 text-sm">
                                    You may choose to disclose your information in certain ways such as
                                    social plug-ins (including those offered by Google, Facebook, Twitter
                                    and Pinterest) or using third-party services that allow you to post
                                    reviews or other information publicly, and a third party could use that
                                    information. Social plug-ins and social applications are operated by
                                    the social network themselves and are subject to their own terms of use
                                    and privacy and cookies policies. You should make sure you are familiar
                                    with these.
                                </p>
                            </div>
                        </div>

                        {/* Section 8 */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">8. Data Retention</h2>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">
                                How long will you use my personal data for?
                            </h3>

                            <p className="text-gray-700 mb-3">
                                We will only retain your personal data for as long as reasonably necessary
                                to fulfil the purposes we collected it for, including for the purposes of
                                satisfying any legal, regulatory, tax, accounting or reporting
                                requirements. We may retain your personal data for a longer period in the
                                event of a complaint or if we reasonably believe there is a prospect of
                                litigation in respect to our relationship with you.
                            </p>

                            <p className="text-gray-700 mb-3">
                                To determine the appropriate retention period for personal data, we
                                consider the amount, nature and sensitivity of the personal data, the
                                potential risk of harm from unauthorised use or disclosure of your personal
                                data, the purposes for which we process your personal data and whether we
                                can achieve those purposes through other means and the applicable legal,
                                regulator, tax, accounting or other requirements.
                            </p>

                            <p className="text-gray-700 mb-3">
                                By law we have to keep basic information about our customers (including
                                Contact, Identity, Financial and Transaction Data) for six years after they
                                cease being Users for tax purposes.
                            </p>

                            <p className="text-gray-700 mb-3">
                                If you delete your account, we remove your name, contact details, address,
                                profile photo, saved cards, payout details, identity documents, watchlist,
                                reminders, notifications and app sign-ins. We keep records of completed
                                sales, payment requests, receipts, statements and payouts for six years for
                                tax and accounting purposes. Questions and answers you posted stay on
                                listings, shown as &ldquo;Deleted user&rdquo;.
                            </p>

                            <p className="text-gray-700 mb-3">
                                In some circumstances you can ask us to delete your data: see{" "}
                                <a href="#your-legal-rights" className="text-blue-600 hover:underline">
                                    YOUR LEGAL RIGHTS
                                </a>{" "}
                                below for further information.
                            </p>

                            <p className="text-gray-700">
                                In some circumstances we will anonymise your personal data (so that it can
                                no longer be associated with you) for research or statistical purposes, in
                                which case we may use this information indefinitely without further notice
                                to you.
                            </p>
                        </div>

                        {/* Section 9 */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">
                                9. Your Legal Rights
                            </h2>

                            <p className="text-gray-700 mb-3">
                                Under certain circumstances, you have rights under data protection laws in
                                relation to your personal data. Please see below to find out more about
                                these rights.
                            </p>

                            <p className="text-gray-700 mb-4">
                                If you wish to exercise any of the rights set out above, please contact us
                                at{" "}
                                <a
                                    href={`mailto:${email}`}
                                    className="text-blue-600 hover:underline break-all"
                                >
                                    {email}
                                </a>
                                .
                            </p>

                            <p className="text-gray-700 mb-4">
                                You can delete your account yourself at any time in Profile &rarr; Security
                                &rarr; Delete my account, on the website or in the app, or see{" "}
                                <a href="/delete-account" className="text-blue-600 hover:underline">
                                    rexbid.ie/delete-account
                                </a>
                                . If you have a live listing, a leading bid, an open offer or a sale in
                                progress, this needs to finish first.
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">
                                No fee usually required
                            </h3>

                            <p className="text-gray-700 mb-3">
                                You will not have to pay a fee to access your personal data (or to exercise
                                any of the other rights). However, we may charge a reasonable fee if your
                                request is clearly unfounded, repetitive or excessive. Alternatively, we
                                could refuse to comply with your request in these circumstances.
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">
                                What we may need from you
                            </h3>

                            <p className="text-gray-700 mb-3">
                                We may need to request specific information from you to help us confirm your
                                identity and ensure your right to access your personal data (or to exercise
                                any of your other rights). This is a security measure to ensure that
                                personal data is not disclosed to any person who has no right to receive
                                it. We may also contact you to ask you for further information in relation
                                to your request to speed up our response.
                            </p>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">
                                Time limit to respond
                            </h3>

                            <p id="glossary" className="text-gray-700">
                                We try to respond to all legitimate requests within one month.
                                Occasionally it could take us longer than a month if your request is
                                particularly complex or you have made a number of requests. In this case,
                                we will notify you and keep you updated.
                            </p>
                        </div>

                        {/* Section 10 - Glossary */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">10. Glossary</h2>

                            <h3 className="font-semibold text-gray-800 mb-2 mt-4">Lawful Basis</h3>

                            <ul className="text-gray-700 space-y-3 list-disc pl-5">
                                <li>
                                    <strong>Legitimate Interest</strong> means the interest of our business
                                    in conducting and managing our business to enable us to give you the
                                    best service/product and the best and most secure experience. We make
                                    sure we consider and balance any potential impact on you (both
                                    positive and negative) and your rights before we process your personal
                                    data for our legitimate interests. We do not use your personal data
                                    for activities where our interests are overridden by the impact on you
                                    (unless we have your consent or are otherwise required or permitted to
                                    by law). You can obtain further information about how we assess our
                                    legitimate interests against any potential impact on you in respect of
                                    specific activities by contacting us.
                                </li>
                                <li>
                                    <strong>Performance of Contract</strong> means processing your data
                                    where it is necessary for the performance of a contract to which you
                                    are a party or to take steps at your request before entering into such
                                    a contract.
                                </li>
                                <li>
                                    <strong>Comply with a legal obligation</strong> means processing your
                                    personal data where it is necessary for compliance with a legal
                                    obligation that we are subject to.
                                </li>
                                <li>
                                    <strong>Services</strong> has the meaning as set out in our Terms.
                                </li>
                                <li>
                                    <strong>our systems</strong> has the same meaning as in our Terms.
                                </li>
                                <li>
                                    <strong>Terms</strong> means our terms of service as accessible
                                    through the Site.
                                </li>
                                <li>
                                    <strong>User buyer</strong> means a User of our Site who is a buyer.
                                </li>
                                <li>
                                    <strong>User seller</strong> means a User of our Site who is a seller.
                                </li>
                            </ul>
                        </div>

                        {/* Section 11 */}
                        <div id="your-legal-rights" className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">
                                11. Your Legal Rights
                            </h2>

                            <p className="text-gray-700 mb-3">You have the right to:</p>

                            <ul className="text-gray-700 space-y-3 list-disc pl-5">
                                <li>
                                    <strong>
                                        Request access to your personal data
                                    </strong>{" "}
                                    (commonly known as a "data subject access request"). This enables you
                                    to receive a copy of the personal data we hold about you and to check
                                    that we are lawfully processing it.
                                </li>
                                <li>
                                    <strong>
                                        Request correction of the personal data
                                    </strong>{" "}
                                    that we hold about you. This enables you to have any incomplete or
                                    inaccurate data we hold about you corrected, though we may need to
                                    verify the accuracy of the new data you provide to us.
                                </li>
                                <li>
                                    <strong>
                                        Request erasure of your personal data
                                    </strong>
                                    . This enables you to ask us to delete or remove personal data where
                                    there is no good reason for us continuing to process it. You also have
                                    the right to ask us to delete or remove your personal data where you
                                    have successfully exercised your right to object to processing (see
                                    below), where we may have processed your information unlawfully or
                                    where we are required to erase your personal data to comply with
                                    local law. Note, however, that we may not always be able to comply
                                    with your request of erasure for specific legal reasons which will be
                                    notified to you, if applicable, at the time of your request.
                                </li>
                                <li>
                                    <strong>
                                        Object to processing of your personal data
                                    </strong>{" "}
                                    where we are relying on a legitimate interest (or those of a third
                                    party) and there is something about your particular situation which
                                    makes you want to object to processing on this ground as you feel it
                                    impacts on your fundamental rights and freedoms. You also have the
                                    right to object where we are processing your personal data for direct
                                    marketing purposes. In some cases, we may demonstrate that we have
                                    compelling legitimate grounds to process your information which
                                    override your rights and freedoms.
                                </li>
                                <li>
                                    <strong>
                                        Request restriction of processing of your personal data
                                    </strong>
                                    . This enables you to ask us to suspend the processing of your
                                    personal data in the following scenarios:
                                    <ul className="list-[lower-roman] pl-5 mt-2 space-y-1">
                                        <li>if you want us to establish the data's accuracy;</li>
                                        <li>
                                            where our use of the data is unlawful but you do not want us
                                            to erase it;
                                        </li>
                                        <li>
                                            where you need us to hold the data even if we no longer
                                            require it as you need it to establish, exercise or defend
                                            legal claims;
                                        </li>
                                        <li>
                                            you have objected to our use of your data but we need to
                                            verify whether we have overriding legitimate grounds to use
                                            it.
                                        </li>
                                    </ul>
                                </li>
                                <li>
                                    <strong>
                                        Request the transfer of your personal data
                                    </strong>{" "}
                                    to you or to a third party. We will provide to you, or a third party
                                    you have chosen, your personal data in a structured, commonly used,
                                    machine-readable format. Note that this right only applies to
                                    automated information which you initially provided consent for us to
                                    use or where we used the information to perform a contract with you.
                                </li>
                                <li>
                                    <strong>Withdraw consent at any time</strong> where we are relying on
                                    consent to process your personal data. However, this will not affect
                                    the lawfulness of any processing carried out before you withdraw your
                                    consent. If you withdraw your consent, we may not be able to provide
                                    certain products or services to you. We will advise you if this is the
                                    case at the time you withdraw your consent.
                                </li>
                            </ul>
                        </div>

                        {/* Contact Us */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">Contact Us</h2>

                            <p className="text-gray-700 mb-4">
                                If you have questions about this Privacy Statement or your personal data,
                                contact us:
                            </p>

                            <div className="bg-gray-50 p-4 rounded">
                                <p className="font-semibold text-gray-900 mb-2">REXBID Limited</p>

                                <p className="text-gray-700 text-sm mb-1">{address}</p>

                                <p className="text-gray-700 text-sm mb-1">
                                    Email:{" "}
                                    <a
                                        href={`mailto:${email}`}
                                        className="text-blue-600 hover:underline break-all"
                                    >
                                        {email}
                                    </a>
                                </p>

                                <p className="text-gray-700 text-sm">
                                    Phone:{" "}
                                    <Link
                                        to={`tel:${otherData?.phoneCode}${otherData?.phone}`}
                                        className="hover:text-[#D19F3E] transition"
                                    >
                                        {otherData?.phoneCode} {otherData?.formatPhone(otherData?.phone)}
                                    </Link>
                                </p>
                            </div>

                            <p className="text-gray-600 text-sm mt-4">
                                You also have the right to lodge a complaint with the Data Protection
                                Commission (DPC) in Ireland (
                                <a
                                    href="https://www.dpc.ie"
                                    className="text-blue-600 hover:underline break-all"
                                >
                                    www.dpc.ie
                                </a>
                                ).
                            </p>
                        </div>

                        {/* Footer Note */}
                        <div className="border-t pt-6 mt-8">
                            <p className="text-gray-500 text-sm">
                                This Privacy Statement is governed by the laws of Ireland. Any disputes
                                will be subject to the jurisdiction of the courts of Ireland.
                            </p>
                        </div>
                    </div>

                    {/* Navigation Links */}
                    <div className="mt-12 pt-8 border-t">
                        <div className="flex flex-wrap gap-3">
                            <Link
                                to="/terms-conditions"
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors"
                            >
                                Terms & Conditions
                            </Link>

                            <Link
                                to="/buyer-agreement"
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors"
                            >
                                Buyer Agreement
                            </Link>
                        </div>
                    </div>
                </div>
            </Container>
        </section>
    );
};

export default PrivacyPolicy;