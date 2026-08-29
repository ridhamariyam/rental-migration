Bridal Rental SaaS — Complete User &
Business Flow

1. System Overview
   The platform has four main actors:
1. Super Admin / Platform Owner — manages the SaaS platform and subscriptions.
1. Shop Owner — purchases the SaaS and manages their rental business.
1. Staff — performs day-to-day shop operations.
1. Customer — rents products from the shop.
   The core hierarchy is:
   SUPER ADMIN / PLATFORM OWNER
   ↓
   SHOP / TENANT
   ↓
   SHOP OWNER
   ↓
   ┌────────┼─────────┐
   ↓ ↓ ↓
   OUTLETS STAFF PRODUCTS
   ↓
   CUSTOMER
   ↓
   ORDER
   ↓
   PAYMENT
   ↓
   PICKUP
   ↓
   RENTAL
   ↓
   RETURN
   ↓
   DAMAGE / DEPOSIT
   ↓
   CLEANING / MAINTENANCE
   ↓
   AVAILABLE
1. Super Admin / Platform Owner
   The Super Admin is the owner of the SaaS platform.
   The Super Admin does not normally manage the daily rental operations of individual shops.
   The primary responsibility is:
   Sell → Activate → Manage → Monitor the SaaS businesses.
   2.1 Customer Subscription Purchase
   The process starts when a business wants to use the platform.
   Business Customer
   ↓
   Choose Subscription Plan
   ↓
   Payment
   ↓
   Payment Confirmed
   Available plans can include:
   • Monthly
   • 6 Months
   • 12 Months
   The subscription should contain:
   Subscription
   ├── Shop
   ├── Plan ├── Start Date
   ├── End Date ├── Amount
   ├── Payment Status ├── Subscription Status
   └── Renewal Date
   2.2 Create Shop
   After payment is confirmed:
   SUPER ADMIN
   ↓
   Create Shop
   ↓
   Create Shop Owner
   ↓
   Assign Subscription
   ↓
   Activate Account
   The Shop Owner account contains:
   Shop Owner
   ├── Name
   ├── Email ├── Phone
   ├── Shop ├── Role
   └── Subscription
   The Shop acts as the tenant/isolation boundary.
   2.3 Handover
   Once the account is activated:
   Super Admin
   ↓
   Account Created
   ↓
   Subscription Activated
   ↓
   Credentials / Access Handover
   ↓
   Shop Owner Login
   After handover, the Shop Owner becomes responsible for operating the business.
1. Shop Owner
   The Shop Owner is the SaaS customer's main user.
   The Shop Owner manages the complete rental business.
   3.1 Shop Owner Login
   Shop Owner
   ↓
   Login
   ↓
   Authentication
   ↓
   Shop Dashboard
   The Shop Owner can access the business areas assigned to the shop.
1. Shop Owner — Initial Business Setup
   The first-time setup flow is:
   Shop Owner
   ↓
   Business Setup
   ↓
   Create Outlet
   ↓
   Create Categories
   ↓
   Create Staff
   ↓
   Add Products
   ↓
   Configure Payments
   ↓
   Configure Notifications / WhatsApp
1. Outlet Management
   A shop can have one or multiple outlets.
   Example:
   Shop
   ├── Kannur Outlet ├── Payyanur Outlet
   └── Kozhikode Outlet
   The Shop Owner manages:
   • Outlet name
   • Address
   • Location
   • GPS coordinates
   • Allowed attendance radius
   • Outlet manager
   • Staff assignment
   • Inventory
   Each outlet has its own operational context.
1. Staff Management
   The Shop Owner creates staff accounts.
   Shop Owner
   ↓
   Staff Management
   ↓
   Create Staff
   ↓
   Assign Role
   ↓
   Assign Outlet
   ↓
   Configure Salary
   ↓
   Staff Login
   Staff information includes:
   • Name
   • Phone
   • Email
   • Role
   • Outlet
   • Salary
   • Permissions
   The Shop Owner can manage:
   • Staff
   • Roles
   • Permissions
   • Outlet assignments
   • Attendance
   • Leave
   • Salary
   • Performance
1. Product Management
   The Shop Owner creates the rental inventory.
   Shop Owner
   ↓
   Products
   ↓
   Add Product
   ↓
   Category
   ↓
   Size
   ↓
   Color
   ↓
   Rental Price
   ↓
   Security Deposit
   ↓
   Images
   ↓
   Outlet
   ↓
   SKU + Barcode
   The system generates:
   Product
   ├── SKU
   └── Barcode
   The Shop Owner can then:
   Generate Barcode
   ↓
   Print Barcode
   ↓
   Attach Barcode to Physical Product
   Product management includes:
   • Categories
   • Products
   • Variations
   • Images
   • Barcode
   • SKU
   • Availability
   • Product history
   • Outlet transfer
   • Cleaning
   • Maintenance
1. Customer Arrives at Shop
   The Customer is normally handled by Staff.
   The current product scope treats Customer as a shop-managed customer rather than requiring a separate
   customer login.
   The flow is:
   Customer Arrives
   ↓
   Staff Assists Customer
   ↓
   Customer Selects Product
   ↓
   Staff Searches / Scans Product
   ↓
   System Checks Availability
   Customer information can include:
   Customer
   ├── Name ├── Phone
   ├── Preferred Size ├── Notes
   └── Booking History
1. Staff Creates Order / Booking
   The Staff creates the rental booking.
   Staff
   ↓
   ↓
   ↓
   ↓
   ↓
   Select Customer
   Scan Product Barcode
   Select Pickup Date
   Select Return Date
   Availability Validation
   The system checks whether the physical product is already booked during the requested rental period.
   If unavailable:
   Product Unavailable
   ↓
   Choose Another Product / Date
   If available:
   Product Available
   ↓
   Continue Booking
1. Booking Amount Calculation
   The system calculates:
   Rental Amount

-

Security Deposit
-

Discount
=

Amount Required
Payment can be:
Advance +
Balance
Supported payment methods:
• Cash
• UPI
The system records the payment transaction and generates the appropriate receipt. 11. Booking Confirmation
After successful booking:
Booking Created
↓
Payment Recorded
↓
Booking Confirmed
↓
Receipt
↓
WhatsApp Confirmation
The customer receives the booking confirmation. 12. Pickup
On the pickup date:
Customer Arrives
↓
Staff Opens Booking
↓
Scan Product Barcode
↓
Verify Booking
↓
Verify Payment
↓
Confirm Pickup
Product lifecycle:
AVAILABLE
↓
RENTED
The customer takes the product. 13. Rental Period
During the rental period:
Product
↓
Customer
↓
Active Rental
The system maintains:
• Booking status
• Product status
• Rental dates
• Customer
• Staff responsible
• Payment status
• Return date
Automatic notifications can be sent according to the configured workflow. 14. Return
On the expected return date:
Customer
↓
Returns Product
↓
Staff Scans Barcode
↓
System Finds Booking
↓
Product Inspection
Staff selects the condition:
Good
Minor Damage
Major Damage 15. Damage & Security Deposit
No Damage
Return
↓
Condition = Good
↓
Deposit Settlement
↓
Refund / Close Deposit
↓
Cleaning if Required
Damage
Return
↓
Damage Detected
↓
Calculate Damage Charge
↓
Apply Security Deposit
↓
Calculate Remaining Refund / Balance
↓
Settlement
↓
Maintenance
The security deposit should remain separate from rental income until the final settlement. 16. Cleaning & Maintenance
After return, the product goes through the appropriate lifecycle.
Cleaning Required
RETURNED
↓
NEEDS CLEANING
↓
CLEANING
↓
AVAILABLE
Maintenance Required
RETURNED
↓
MAINTENANCE
↓
REPAIR COMPLETED
↓
AVAILABLE
A product should not become available for another booking while it is still being cleaned or repaired. 17. Staff Attendance
At the beginning of the working day:
Staff Login
↓
Assigned Outlet Identified
↓
GPS Location Retrieved
↓
Distance From Outlet Checked
↓
Inside Allowed Radius?
If yes:
CHECK-IN
If outside the allowed radius:
ATTENDANCE REJECTED
At the end of the day:
Staff
↓
Check-out
↓
Attendance Recorded
The Shop Owner can review attendance and manually correct it when necessary. 18. Salary
Attendance contributes to salary calculation.
Attendance
↓
Working Days
↓
Present / Absent
↓
Salary Calculation
↓
Salary Record
The Shop Owner can review salary records and staff performance. 19. Shop Owner Dashboard
The Shop Owner has visibility into the entire business.
SHOP OWNER DASHBOARD
│
├── Today's Bookings ├── Today's Returns
├── Today's Revenue ├── Pending Payments
├── Active Rentals ├── Available Products
├── Pending Returns ├── Cleaning
├── Maintenance ├── Staff Performance
└── Outlet Performance 20. Shop Owner Main Modules
The Shop Owner can manage:
Dashboard
Products
Categories
Product Variations
Customers
Orders / Bookings
Payments
Returns
Cleaning
Maintenance
Staff
Attendance
Leave
Salary
Revenue Share
Outlets
Reports
Notifications
Settings 21. Reports
The Shop Owner can monitor:
• Daily income
• Monthly income
• Pending returns
• Pending deposits
• Most rented products
• Revenue by outlet
• Staff performance
• Owner settlements
Reports help the Shop Owner understand business performance and make operational decisions. 22. Customer Complete Journey
From the Customer's perspective:
Visit Shop
↓
Select Product
↓
Provide Customer Details
↓
Select Rental Dates
↓
Availability Checked
↓
Booking Created
↓
Pay Advance
↓
Receive Confirmation
↓
Pickup
↓
Use Product
↓
Return Product
↓
Inspection
↓
Damage / Deposit Settlement
↓
Booking Closed
The current scope does not require the Customer to have a separate login.
An online customer booking portal can be added later. 23. Shop Owner Complete Journey
Subscription Activated
↓
Shop Owner Login
↓
Business Setup
↓
Create Outlets
↓
Create Staff
↓
Create Categories
↓
Add Products
↓
Generate Barcodes
↓
Manage Inventory
↓
Customers Visit
↓
↓
Staff Creates Bookings
Payments
↓
Pickup
↓
Rental
↓
Returns
↓
Damage / Deposit Settlement
↓
Cleaning / Maintenance
↓
Product Available Again
↓
Reports
↓
Business Management 24. Super Admin Complete Journey
Business Customer
↓
Selects Subscription
↓
Payment
↓
Super Admin Receives Payment
↓
Create Shop
↓
Create Shop Owner
↓
Assign Plan
↓
Activate Subscription
↓
Handover Account
↓
Shop Owner Operates Business
↓
Super Admin Monitors Platform
The Super Admin's primary modules are:
Super Admin
│ ├── Shops
├── Shop Owners ├── Subscription Plans
├── Subscriptions ├── Subscription Payments
├── Active Shops ├── Expired Shops
├── Platform Revenue ├── Platform Users
└── System Health 25. Subscription Lifecycle
The SaaS subscription has its own lifecycle, separate from the rental booking lifecycle.
PLAN PURCHASE
↓
PAYMENT
↓
SHOP CREATED
↓
SHOP OWNER CREATED
↓
SUBSCRIPTION ACTIVATED
↓
ACCOUNT HANDED OVER
↓
ACTIVE SUBSCRIPTION
↓
RENEWAL DUE
↓
RENEWED
│ └───────────────┐
↓
EXPIRED
↓
ACCESS RESTRICTED
Example:
Monthly
Start: Aug 15
End: Sep 14
6 Months
Start: Aug 15
End: Feb 14
12 Months
Start: Aug 15
End: Aug 14
The subscription controls access to the SaaS. The Shop Owner controls the rental business inside the
SaaS. 26. Final Role Separation
Super Admin / Platform Owner
Manages the SaaS.
Plans
Subscriptions
Payments
Shops
Shop Owners
Platform Monitoring
Shop Owner
Manages the business.
Dashboard
Products
Orders
Customers
Payments
Staff
Outlets
Attendance
Salary
Reports
Settings
Staff
Operates the shop.
Attendance
Customers
Bookings
Barcode Scanning
Payments
Pickup
Returns
Cleaning
Maintenance
Customer
Uses the rental service.
Select Product
→ Book
→ Pay
→ Pickup
→ Rent
→ Return
→ Settlement 27. Core Business Model
The entire SaaS can therefore be understood as two connected systems:
SaaS Management Layer
YOU
↓
↓
Shop
↓
Subscription
Shop Owner
Rental Operations Layer
Shop Owner
↓
Outlets
↓
Staff
↓
Products
↓
Customers
↓
Orders
↓
Payments
↓
Pickup
↓
Rental
↓
Return
↓
Settlement
↓
↓
Cleaning / Maintenance
Available Again
This separation should remain clear in the architecture: Super Admin manages the SaaS customer
and subscription; Shop Owner manages the rental business; Staff executes operations; Customer
participates in the rental transaction.
