import { AdminContainer, AdminHeader, AdminSidebar } from '../../components';
import CreateListingForm from '../../components/listing/CreateListingForm';

// Admins use the same listing form as sellers (components/listing/
// CreateListingForm.jsx), plus the Giveaway type.
const CreateAuction = () => (
    <CreateListingForm
        Container={AdminContainer}
        Header={AdminHeader}
        Sidebar={AdminSidebar}
        basePath="/admin"
        defaultUserType="admin"
        isAdmin
    />
);

export default CreateAuction;
