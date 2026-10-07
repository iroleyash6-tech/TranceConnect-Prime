-- ===============================================================
-- TRANCECONNECT-PRIME: COMPLETE DATABASE PROJECT DUMP
-- Target Database: transconnectlinkx
-- Relational MySQL 8.0 Data & Schema
-- ===============================================================

SET FOREIGN_KEY_CHECKS=0;
CREATE DATABASE IF NOT EXISTS `transconnectlinkx`;
USE `transconnectlinkx`;

-- -------------------------------------------------------------
-- Structure for table `users`
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `role` enum('dealer','transporter','admin') COLLATE utf8mb4_unicode_ci NOT NULL,
  `company_name` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_person` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mobile` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `gst_number` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `status` enum('active','inactive','blocked') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_user_role` (`role`),
  KEY `idx_user_email` (`email`),
  KEY `idx_user_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data records for `users` (12 rows)
INSERT INTO `users` (`id`, `role`, `company_name`, `contact_person`, `mobile`, `email`, `gst_number`, `password_hash`, `address`, `city`, `state`, `verification_status`, `status`, `created_at`, `updated_at`) VALUES (1, 'admin', 'TranceConnect HQ', 'System Admin', '9876543210', 'admin@tranceconnect.com', '27AAAAA0000A1Z5', 'scrypt:32768:8:1$4AEfmigLZYFGVI6E$26ce256debb44cf70f51dcadebd6c81ad30e20949203c796045bf1c79d3a3c00d6eea64ea178a07c76ac8fa0e3a3368d0ca781429faa742fad74153354b4f992', NULL, NULL, NULL, 'verified', 'active', '2026-10-03 20:53:59', '2026-10-03 21:13:14');
INSERT INTO `users` (`id`, `role`, `company_name`, `contact_person`, `mobile`, `email`, `gst_number`, `password_hash`, `address`, `city`, `state`, `verification_status`, `status`, `created_at`, `updated_at`) VALUES (2, 'transporter', 'Apex Logistics & Freight Corp', 'Rajesh Sharma', '9822011223', 'transporter@tranceconnect.com', '27AABCT1234F1Z8', 'scrypt:32768:8:1$m28DSVo9SposHESi$481544ab17ad4acaec5e3ac78641f422301db87ef3ad2269770a6300e399b470a88d3531d116c3d86bdd3c13346f77ffc3268ea87740660d9b8cdc0a678bbbe3', NULL, 'Mumbai', 'Maharashtra', 'verified', 'active', '2026-10-03 20:53:59', '2026-10-03 20:53:59');
INSERT INTO `users` (`id`, `role`, `company_name`, `contact_person`, `mobile`, `email`, `gst_number`, `password_hash`, `address`, `city`, `state`, `verification_status`, `status`, `created_at`, `updated_at`) VALUES (3, 'transporter', 'SpeedRoad Express Carriers', 'Amit Patil', '9890123456', 'speedfreight@tranceconnect.com', '27AABCS5678G1Z2', 'scrypt:32768:8:1$m28DSVo9SposHESi$481544ab17ad4acaec5e3ac78641f422301db87ef3ad2269770a6300e399b470a88d3531d116c3d86bdd3c13346f77ffc3268ea87740660d9b8cdc0a678bbbe3', NULL, 'Pune', 'Maharashtra', 'verified', 'active', '2026-10-03 20:53:59', '2026-10-03 20:53:59');
INSERT INTO `users` (`id`, `role`, `company_name`, `contact_person`, `mobile`, `email`, `gst_number`, `password_hash`, `address`, `city`, `state`, `verification_status`, `status`, `created_at`, `updated_at`) VALUES (4, 'dealer', 'Bharat Steel & Infrastructure Ltd', 'Vikram Mehta', '9819876543', 'dealer@tranceconnect.com', '27AAACB2345M1ZV', 'scrypt:32768:8:1$m28DSVo9SposHESi$481544ab17ad4acaec5e3ac78641f422301db87ef3ad2269770a6300e399b470a88d3531d116c3d86bdd3c13346f77ffc3268ea87740660d9b8cdc0a678bbbe3', NULL, 'Navi Mumbai', 'Maharashtra', 'verified', 'active', '2026-10-03 20:53:59', '2026-10-03 20:53:59');
INSERT INTO `users` (`id`, `role`, `company_name`, `contact_person`, `mobile`, `email`, `gst_number`, `password_hash`, `address`, `city`, `state`, `verification_status`, `status`, `created_at`, `updated_at`) VALUES (5, 'dealer', 'Vikram Steels Ltd', 'Vikram Goel', '9811122233', 'vikram.steel@example.com', '27ABCDE1234F1Z5', 'scrypt:32768:8:1$5RU8hviHoFl0jLA7$6a78e1a5c80864e78e4c55ad4185c57429fb027447518d44091ea809f9ef61a2086e8abf8d6768443b0890c47472894fba198b86a49cb18bcab720f6097b9e08', NULL, 'Mumbai', '', 'pending', 'active', '2026-10-03 21:01:13', '2026-10-03 21:01:14');
INSERT INTO `users` (`id`, `role`, `company_name`, `contact_person`, `mobile`, `email`, `gst_number`, `password_hash`, `address`, `city`, `state`, `verification_status`, `status`, `created_at`, `updated_at`) VALUES (6, 'transporter', 'FastLane Road Freight Lines', 'Harish Rawat', '9822233344', 'fastlane.freight@example.com', '27FASTL5678G1Z1', 'scrypt:32768:8:1$21YMKMycltiDkonJ$70397e24c3d24f475fa395c101b1af989e414a9607036814d759428cded6dfb3572e56dfb8d0304de8f4a571ca7183d03818056535766b9046c04491e141f468', NULL, 'Pune', '', 'pending', 'active', '2026-10-03 21:01:13', '2026-10-03 21:01:13');
INSERT INTO `users` (`id`, `role`, `company_name`, `contact_person`, `mobile`, `email`, `gst_number`, `password_hash`, `address`, `city`, `state`, `verification_status`, `status`, `created_at`, `updated_at`) VALUES (9, 'transporter', 'Mahalaxmi Heavy Haulers', 'Sanjay Rathore', '9820554433', 'mahalaxmi@tranceconnect.com', '27AAECM9988H1ZT', 'scrypt:32768:8:1$u73QMJ9qORWxt1mM$582a4ad225ce7f7d5c082b21b9d904dd36990b59a86e18464b9e50830f1b515598427c7f586631299df3c365d9b7bd557e3f4cdbc48c1aed3c51dff878770a86', 'JNPT CFS Area', 'Navi Mumbai', 'Maharashtra', 'verified', 'active', '2026-10-03 21:12:27', '2026-10-03 21:13:14');
INSERT INTO `users` (`id`, `role`, `company_name`, `contact_person`, `mobile`, `email`, `gst_number`, `password_hash`, `address`, `city`, `state`, `verification_status`, `status`, `created_at`, `updated_at`) VALUES (10, 'transporter', 'Gujarat Western Carriers', 'Pravin Patel', '9825123456', 'western@tranceconnect.com', '24AABCG1122D1Z9', 'scrypt:32768:8:1$u73QMJ9qORWxt1mM$582a4ad225ce7f7d5c082b21b9d904dd36990b59a86e18464b9e50830f1b515598427c7f586631299df3c365d9b7bd557e3f4cdbc48c1aed3c51dff878770a86', 'GIDC Industrial Estate', 'Surat', 'Gujarat', 'verified', 'active', '2026-10-03 21:12:27', '2026-10-03 21:12:27');
INSERT INTO `users` (`id`, `role`, `company_name`, `contact_person`, `mobile`, `email`, `gst_number`, `password_hash`, `address`, `city`, `state`, `verification_status`, `status`, `created_at`, `updated_at`) VALUES (11, 'transporter', 'Southern Roadlines Ltd', 'K. Murugan', '9840123456', 'southern@tranceconnect.com', '33AABCS4455E1Z3', 'scrypt:32768:8:1$u73QMJ9qORWxt1mM$582a4ad225ce7f7d5c082b21b9d904dd36990b59a86e18464b9e50830f1b515598427c7f586631299df3c365d9b7bd557e3f4cdbc48c1aed3c51dff878770a86', 'Ambattur Industrial Estate', 'Chennai', 'Tamil Nadu', 'verified', 'active', '2026-10-03 21:12:27', '2026-10-03 21:13:14');
INSERT INTO `users` (`id`, `role`, `company_name`, `contact_person`, `mobile`, `email`, `gst_number`, `password_hash`, `address`, `city`, `state`, `verification_status`, `status`, `created_at`, `updated_at`) VALUES (13, 'dealer', 'Kirloskar Industrial Machinery Corp', 'Anand Kirloskar', '9823112244', 'kirloskar@tranceconnect.com', '27AAACK1122K1Z4', 'scrypt:32768:8:1$u73QMJ9qORWxt1mM$582a4ad225ce7f7d5c082b21b9d904dd36990b59a86e18464b9e50830f1b515598427c7f586631299df3c365d9b7bd557e3f4cdbc48c1aed3c51dff878770a86', 'Hadapsar Industrial Estate', 'Pune', 'Maharashtra', 'verified', 'active', '2026-10-03 21:12:27', '2026-10-03 21:13:14');
INSERT INTO `users` (`id`, `role`, `company_name`, `contact_person`, `mobile`, `email`, `gst_number`, `password_hash`, `address`, `city`, `state`, `verification_status`, `status`, `created_at`, `updated_at`) VALUES (14, 'dealer', 'Godrej Commodities & Agrovet', 'Sunil Deshmukh', '9821445566', 'agrovet@tranceconnect.com', '27AAACG3344J1Z7', 'scrypt:32768:8:1$u73QMJ9qORWxt1mM$582a4ad225ce7f7d5c082b21b9d904dd36990b59a86e18464b9e50830f1b515598427c7f586631299df3c365d9b7bd557e3f4cdbc48c1aed3c51dff878770a86', 'Vikhroli West', 'Mumbai', 'Maharashtra', 'verified', 'active', '2026-10-03 21:12:27', '2026-10-03 21:13:14');
INSERT INTO `users` (`id`, `role`, `company_name`, `contact_person`, `mobile`, `email`, `gst_number`, `password_hash`, `address`, `city`, `state`, `verification_status`, `status`, `created_at`, `updated_at`) VALUES (23, 'dealer', 'gpooo', 'gpooo', '2536524125', 'iroleyash2@gmail.com', '7859654256', 'scrypt:32768:8:1$kjwYiAaO3dYVk9Xv$964fdbee5b0ab37a1ba221d04a0b2fab8f8e918a6e8db443e04f8edc6943553ab4c809f14faf0d359746069341bb2b2a679f564f797c5f5ea9868084fbb989e1', NULL, 'mumbai', '', 'pending', 'active', '2026-10-03 21:21:46', '2026-10-03 21:21:46');

-- -------------------------------------------------------------
-- Structure for table `password_resets`
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `password_resets`;
CREATE TABLE `password_resets` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `email` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `otp_code` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_used` tinyint(1) DEFAULT '0',
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reset_email_otp` (`email`,`otp_code`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data records for `password_resets` (1 rows)
INSERT INTO `password_resets` (`id`, `email`, `otp_code`, `is_used`, `expires_at`, `created_at`) VALUES (1, 'vikram.steel@example.com', '406340', 1, '2026-10-03 15:46:15', '2026-10-03 21:01:14');

-- -------------------------------------------------------------
-- Structure for table `vehicles`
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `vehicles`;
CREATE TABLE `vehicles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `transporter_id` bigint NOT NULL,
  `vehicle_number` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `capacity_tons` decimal(10,2) NOT NULL,
  `rc_document` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insurance_document` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `current_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('available','assigned','in_transit','maintenance') COLLATE utf8mb4_unicode_ci DEFAULT 'available',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `image_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '/assets/vehicles/container-truck.svg',
  PRIMARY KEY (`id`),
  UNIQUE KEY `vehicle_number` (`vehicle_number`),
  KEY `idx_vehicle_transporter` (`transporter_id`),
  KEY `idx_vehicle_status` (`status`),
  CONSTRAINT `vehicles_ibfk_1` FOREIGN KEY (`transporter_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data records for `vehicles` (9 rows)
INSERT INTO `vehicles` (`id`, `transporter_id`, `vehicle_number`, `vehicle_type`, `capacity_tons`, `rc_document`, `insurance_document`, `current_location`, `status`, `created_at`, `updated_at`, `image_url`) VALUES (1, 2, 'MH-04-AB-1234', '32ft Multi-Axle Truck (MXL)', '25.00', NULL, NULL, 'Panvel Highway Junction, Navi Mumbai', 'in_transit', '2026-10-03 20:53:59', '2026-10-05 20:37:47', '/assets/vehicles/container-truck.svg');
INSERT INTO `vehicles` (`id`, `transporter_id`, `vehicle_number`, `vehicle_type`, `capacity_tons`, `rc_document`, `insurance_document`, `current_location`, `status`, `created_at`, `updated_at`, `image_url`) VALUES (2, 2, 'MH-04-CD-5678', '20ft Container Truck', '15.00', NULL, NULL, 'Mumbai-Pune Expressway (Km 42)', 'available', '2026-10-03 20:53:59', '2026-10-03 21:13:14', '/assets/vehicles/container-truck.svg');
INSERT INTO `vehicles` (`id`, `transporter_id`, `vehicle_number`, `vehicle_type`, `capacity_tons`, `rc_document`, `insurance_document`, `current_location`, `status`, `created_at`, `updated_at`, `image_url`) VALUES (3, 3, 'MH-12-EF-9012', '14ft Open Body', '8.50', NULL, NULL, 'Chakan Industrial Hub, Pune', 'available', '2026-10-03 20:53:59', '2026-10-04 14:18:58', '/assets/vehicles/open-body-truck.svg');
INSERT INTO `vehicles` (`id`, `transporter_id`, `vehicle_number`, `vehicle_type`, `capacity_tons`, `rc_document`, `insurance_document`, `current_location`, `status`, `created_at`, `updated_at`, `image_url`) VALUES (4, 6, 'MH-14-FL-602', '32ft Multi-Axle Truck', '25.00', '', '', 'Chakan Industrial Zone, Pune', 'available', '2026-10-03 21:01:14', '2026-10-03 21:01:14', '/assets/vehicles/container-truck.svg');
INSERT INTO `vehicles` (`id`, `transporter_id`, `vehicle_number`, `vehicle_type`, `capacity_tons`, `rc_document`, `insurance_document`, `current_location`, `status`, `created_at`, `updated_at`, `image_url`) VALUES (7, 2, 'MH-04-EF-9012', '14ft Open Body Truck', '8.50', NULL, NULL, 'JNPT Port Container Gate 3', 'available', '2026-10-03 21:13:14', '2026-10-04 14:18:58', '/assets/vehicles/open-body-truck.svg');
INSERT INTO `vehicles` (`id`, `transporter_id`, `vehicle_number`, `vehicle_type`, `capacity_tons`, `rc_document`, `insurance_document`, `current_location`, `status`, `created_at`, `updated_at`, `image_url`) VALUES (8, 3, 'MH-12-GH-3456', '32ft Multi-Axle Truck (MXL)', '26.00', NULL, NULL, 'Chakan MIDC Phase 2, Pune', 'available', '2026-10-03 21:13:14', '2026-10-03 21:13:14', '/assets/vehicles/container-truck.svg');
INSERT INTO `vehicles` (`id`, `transporter_id`, `vehicle_number`, `vehicle_type`, `capacity_tons`, `rc_document`, `insurance_document`, `current_location`, `status`, `created_at`, `updated_at`, `image_url`) VALUES (9, 3, 'MH-12-JK-7890', '40ft Heavy Flatbed Trailer', '35.00', NULL, NULL, 'Talegaon Industrial Hub, Pune', 'available', '2026-10-03 21:13:14', '2026-10-04 14:18:58', '/assets/vehicles/trailer-truck.svg');
INSERT INTO `vehicles` (`id`, `transporter_id`, `vehicle_number`, `vehicle_type`, `capacity_tons`, `rc_document`, `insurance_document`, `current_location`, `status`, `created_at`, `updated_at`, `image_url`) VALUES (10, 3, 'MH-12-LM-1122', '17ft Closed Container', '9.00', NULL, NULL, 'Lonavala Expressway Corridor', 'available', '2026-10-03 21:13:14', '2026-10-04 14:18:58', '/assets/vehicles/container-truck.svg');
INSERT INTO `vehicles` (`id`, `transporter_id`, `vehicle_number`, `vehicle_type`, `capacity_tons`, `rc_document`, `insurance_document`, `current_location`, `status`, `created_at`, `updated_at`, `image_url`) VALUES (11, 9, 'MH-06-MN-4455', '24ft High Cube Container', '16.00', NULL, NULL, 'Panvel Freight Terminal', 'available', '2026-10-03 21:13:14', '2026-10-03 21:13:14', '/assets/vehicles/container-truck.svg');

-- -------------------------------------------------------------
-- Structure for table `drivers`
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `drivers`;
CREATE TABLE `drivers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `transporter_id` bigint NOT NULL,
  `vehicle_id` bigint DEFAULT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mobile` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `license_number` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `aadhaar_number` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `license_document` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aadhaar_document` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('available','assigned','off_duty') COLLATE utf8mb4_unicode_ci DEFAULT 'available',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `vehicle_id` (`vehicle_id`),
  KEY `idx_driver_transporter` (`transporter_id`),
  CONSTRAINT `drivers_ibfk_1` FOREIGN KEY (`transporter_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `drivers_ibfk_2` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data records for `drivers` (8 rows)
INSERT INTO `drivers` (`id`, `transporter_id`, `vehicle_id`, `name`, `mobile`, `license_number`, `aadhaar_number`, `license_document`, `aadhaar_document`, `status`, `created_at`, `updated_at`) VALUES (1, 2, 1, 'Ramesh Yadav', '9870011223', 'MH0420180012345', '123456789012', NULL, NULL, 'available', '2026-10-03 20:53:59', '2026-10-03 20:53:59');
INSERT INTO `drivers` (`id`, `transporter_id`, `vehicle_id`, `name`, `mobile`, `license_number`, `aadhaar_number`, `license_document`, `aadhaar_document`, `status`, `created_at`, `updated_at`) VALUES (2, 2, 2, 'Suresh Kadam', '9870011224', 'MH0420190054321', '234567890123', NULL, NULL, 'available', '2026-10-03 20:53:59', '2026-10-03 20:53:59');
INSERT INTO `drivers` (`id`, `transporter_id`, `vehicle_id`, `name`, `mobile`, `license_number`, `aadhaar_number`, `license_document`, `aadhaar_document`, `status`, `created_at`, `updated_at`) VALUES (3, 3, 3, 'Ganesh Pawar', '9870011225', 'MH1220200098765', '345678901234', NULL, NULL, 'available', '2026-10-03 20:53:59', '2026-10-03 20:53:59');
INSERT INTO `drivers` (`id`, `transporter_id`, `vehicle_id`, `name`, `mobile`, `license_number`, `aadhaar_number`, `license_document`, `aadhaar_document`, `status`, `created_at`, `updated_at`) VALUES (4, 6, NULL, 'Dinesh Gurjar', '9833344455', 'MH1420196002', '778899001122', '', '', 'available', '2026-10-03 21:01:14', '2026-10-03 21:01:14');
INSERT INTO `drivers` (`id`, `transporter_id`, `vehicle_id`, `name`, `mobile`, `license_number`, `aadhaar_number`, `license_document`, `aadhaar_document`, `status`, `created_at`, `updated_at`) VALUES (5, 2, 1, 'Ramesh Yadav', '9870011223', 'MH0420180012345', '123456789012', NULL, NULL, 'available', '2026-10-03 21:13:14', '2026-10-03 21:13:14');
INSERT INTO `drivers` (`id`, `transporter_id`, `vehicle_id`, `name`, `mobile`, `license_number`, `aadhaar_number`, `license_document`, `aadhaar_document`, `status`, `created_at`, `updated_at`) VALUES (6, 2, 2, 'Suresh Kadam', '9870011224', 'MH0420190054321', '234567890123', NULL, NULL, 'assigned', '2026-10-03 21:13:14', '2026-10-03 21:13:14');
INSERT INTO `drivers` (`id`, `transporter_id`, `vehicle_id`, `name`, `mobile`, `license_number`, `aadhaar_number`, `license_document`, `aadhaar_document`, `status`, `created_at`, `updated_at`) VALUES (7, 3, NULL, 'Mahesh Shinde', '9890011226', 'MH1220170067890', '456789012345', NULL, NULL, 'available', '2026-10-03 21:13:14', '2026-10-03 21:13:14');
INSERT INTO `drivers` (`id`, `transporter_id`, `vehicle_id`, `name`, `mobile`, `license_number`, `aadhaar_number`, `license_document`, `aadhaar_document`, `status`, `created_at`, `updated_at`) VALUES (8, 3, NULL, 'Dinesh Gurjar', '9890011227', 'MH1220190045678', '567890123456', NULL, NULL, 'available', '2026-10-03 21:13:14', '2026-10-03 21:13:14');

-- -------------------------------------------------------------
-- Structure for table `shipments`
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `shipments`;
CREATE TABLE `shipments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `dealer_id` bigint NOT NULL,
  `transporter_id` bigint DEFAULT NULL,
  `vehicle_id` bigint DEFAULT NULL,
  `driver_id` bigint DEFAULT NULL,
  `product_type` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `transport_type` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `weight_tons` decimal(10,2) NOT NULL,
  `vehicle_required` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pickup_location` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `delivery_location` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pickup_date` date DEFAULT NULL,
  `expected_delivery_date` date DEFAULT NULL,
  `price_per_trip` decimal(12,2) NOT NULL DEFAULT '0.00',
  `invoice_document` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `do_document` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('Pending','Assigned','Accepted','In Transit','Delivered','Cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'Pending',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `vehicle_id` (`vehicle_id`),
  KEY `driver_id` (`driver_id`),
  KEY `idx_shipment_dealer` (`dealer_id`),
  KEY `idx_shipment_transporter` (`transporter_id`),
  KEY `idx_shipment_status` (`status`),
  CONSTRAINT `shipments_ibfk_1` FOREIGN KEY (`dealer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `shipments_ibfk_2` FOREIGN KEY (`transporter_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `shipments_ibfk_3` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL,
  CONSTRAINT `shipments_ibfk_4` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data records for `shipments` (7 rows)
INSERT INTO `shipments` (`id`, `dealer_id`, `transporter_id`, `vehicle_id`, `driver_id`, `product_type`, `transport_type`, `weight_tons`, `vehicle_required`, `pickup_location`, `delivery_location`, `pickup_date`, `expected_delivery_date`, `price_per_trip`, `invoice_document`, `do_document`, `status`, `notes`, `created_at`, `updated_at`) VALUES (1, 4, 2, 1, 1, 'Industrial Steel Coils', 'Full Truckload (FTL)', '18.50', '32ft Multi-Axle Truck', 'JNPT Port, Navi Mumbai', 'Bhosari MIDC, Pune', NULL, NULL, '32000.00', '', '', 'In Transit', 'Urgent export shipment. Handle with care.', '2026-10-03 20:57:27', '2026-10-03 20:57:28');
INSERT INTO `shipments` (`id`, `dealer_id`, `transporter_id`, `vehicle_id`, `driver_id`, `product_type`, `transport_type`, `weight_tons`, `vehicle_required`, `pickup_location`, `delivery_location`, `pickup_date`, `expected_delivery_date`, `price_per_trip`, `invoice_document`, `do_document`, `status`, `notes`, `created_at`, `updated_at`) VALUES (2, 5, 6, NULL, 4, 'Cold Rolled Steel Coils', 'Full Truckload (FTL)', '22.00', '32ft Multi-Axle Truck', 'JNPT Container Terminal, Navi Mumbai', 'Chakan Auto Hub, Pune', NULL, NULL, '38500.00', '', '', 'Delivered', 'Urgent auto OEM supply line.', '2026-10-03 21:01:14', '2026-10-03 21:01:14');
INSERT INTO `shipments` (`id`, `dealer_id`, `transporter_id`, `vehicle_id`, `driver_id`, `product_type`, `transport_type`, `weight_tons`, `vehicle_required`, `pickup_location`, `delivery_location`, `pickup_date`, `expected_delivery_date`, `price_per_trip`, `invoice_document`, `do_document`, `status`, `notes`, `created_at`, `updated_at`) VALUES (3, 4, 2, 2, NULL, 'Cold Rolled Steel Coils', 'Full Truckload (FTL)', '18.50', '32ft Multi-Axle Truck (MXL)', 'JNPT Container Terminal, Navi Mumbai', 'Bhosari MIDC, Pune', NULL, NULL, '34500.00', NULL, NULL, 'In Transit', 'Driver Suresh Kadam navigating expressway', '2026-10-03 21:13:14', '2026-10-03 21:13:14');
INSERT INTO `shipments` (`id`, `dealer_id`, `transporter_id`, `vehicle_id`, `driver_id`, `product_type`, `transport_type`, `weight_tons`, `vehicle_required`, `pickup_location`, `delivery_location`, `pickup_date`, `expected_delivery_date`, `price_per_trip`, `invoice_document`, `do_document`, `status`, `notes`, `created_at`, `updated_at`) VALUES (4, 4, 2, 1, NULL, 'Structural Steel Angles & Beams', 'Full Truckload (FTL)', '24.00', '32ft Multi-Axle Truck (MXL)', 'Kalamboli Steel Yard, Navi Mumbai', 'Chakan Auto Cluster, Pune', NULL, NULL, '39000.00', NULL, NULL, 'Accepted', 'Transporter accepted. Loading scheduled tomorrow 8:00 AM', '2026-10-03 21:13:14', '2026-10-03 21:13:14');
INSERT INTO `shipments` (`id`, `dealer_id`, `transporter_id`, `vehicle_id`, `driver_id`, `product_type`, `transport_type`, `weight_tons`, `vehicle_required`, `pickup_location`, `delivery_location`, `pickup_date`, `expected_delivery_date`, `price_per_trip`, `invoice_document`, `do_document`, `status`, `notes`, `created_at`, `updated_at`) VALUES (5, 4, 3, NULL, NULL, 'Industrial Fabricated Assemblies', 'Full Truckload (FTL)', '12.00', '20ft Container Truck', 'Thane Belapur Road MIDC, Navi Mumbai', 'Waluj MIDC, Aurangabad', NULL, NULL, '42000.00', NULL, NULL, 'Assigned', 'Awaiting transporter acceptance confirmation', '2026-10-03 21:13:14', '2026-10-03 21:13:14');
INSERT INTO `shipments` (`id`, `dealer_id`, `transporter_id`, `vehicle_id`, `driver_id`, `product_type`, `transport_type`, `weight_tons`, `vehicle_required`, `pickup_location`, `delivery_location`, `pickup_date`, `expected_delivery_date`, `price_per_trip`, `invoice_document`, `do_document`, `status`, `notes`, `created_at`, `updated_at`) VALUES (6, 4, NULL, NULL, NULL, 'Galvanized Corrugated Sheets', 'Full Truckload (FTL)', '15.00', '24ft Container', 'Taloja Industrial MIDC, Navi Mumbai', 'GIDC Estate, Vapi, Gujarat', NULL, NULL, '28000.00', NULL, NULL, 'Pending', 'Open to all verified transporters', '2026-10-03 21:13:14', '2026-10-03 21:13:14');
INSERT INTO `shipments` (`id`, `dealer_id`, `transporter_id`, `vehicle_id`, `driver_id`, `product_type`, `transport_type`, `weight_tons`, `vehicle_required`, `pickup_location`, `delivery_location`, `pickup_date`, `expected_delivery_date`, `price_per_trip`, `invoice_document`, `do_document`, `status`, `notes`, `created_at`, `updated_at`) VALUES (7, 4, 2, 1, NULL, 'Hot Rolled Steel Plates', 'Full Truckload (FTL)', '22.00', '32ft Multi-Axle Truck (MXL)', 'JNPT Port CFS, Navi Mumbai', 'Hadapsar Industrial Estate, Pune', NULL, NULL, '36000.00', NULL, NULL, 'Delivered', 'Delivered intact with gate inward seal #88192', '2026-10-03 21:13:14', '2026-10-03 21:13:14');

-- -------------------------------------------------------------
-- Structure for table `documents`
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `documents`;
CREATE TABLE `documents` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `shipment_id` bigint DEFAULT NULL,
  `vehicle_id` bigint DEFAULT NULL,
  `driver_id` bigint DEFAULT NULL,
  `document_type` enum('aadhaar','driving_license','invoice','delivery_order','rc','insurance','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint DEFAULT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `rejection_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_doc_user` (`user_id`),
  KEY `idx_doc_shipment` (`shipment_id`),
  KEY `idx_doc_type` (`document_type`),
  CONSTRAINT `documents_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `documents_ibfk_2` FOREIGN KEY (`shipment_id`) REFERENCES `shipments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data records for `documents` (5 rows)
INSERT INTO `documents` (`id`, `user_id`, `shipment_id`, `vehicle_id`, `driver_id`, `document_type`, `file_name`, `file_path`, `file_size`, `mime_type`, `verification_status`, `rejection_reason`, `uploaded_at`) VALUES (1, 4, 1, NULL, NULL, 'invoice', 'test_invoice.pdf', 'invoice_2fb3430753d2.pdf', 33, 'application/pdf', 'pending', NULL, '2026-10-03 20:57:39');
INSERT INTO `documents` (`id`, `user_id`, `shipment_id`, `vehicle_id`, `driver_id`, `document_type`, `file_name`, `file_path`, `file_size`, `mime_type`, `verification_status`, `rejection_reason`, `uploaded_at`) VALUES (2, 5, 2, NULL, NULL, 'invoice', 'commercial_invoice_991.pdf', 'invoice_5dc2e3e96387.pdf', 29, 'application/pdf', 'verified', NULL, '2026-10-03 21:01:14');
INSERT INTO `documents` (`id`, `user_id`, `shipment_id`, `vehicle_id`, `driver_id`, `document_type`, `file_name`, `file_path`, `file_size`, `mime_type`, `verification_status`, `rejection_reason`, `uploaded_at`) VALUES (3, 4, 1, NULL, NULL, 'invoice', 'COMMERCIAL TAX INVOICE (FREIGHT) - INV-2026-8267.html', 'invoice_INV-2026-8267_2061f845.html', 5410, 'text/html', 'verified', NULL, '2026-10-03 21:31:31');
INSERT INTO `documents` (`id`, `user_id`, `shipment_id`, `vehicle_id`, `driver_id`, `document_type`, `file_name`, `file_path`, `file_size`, `mime_type`, `verification_status`, `rejection_reason`, `uploaded_at`) VALUES (4, 4, 1, NULL, NULL, 'invoice', 'COMMERCIAL TAX INVOICE (FREIGHT) - INV-2026-2440.html', 'invoice_INV-2026-2440_35bf5464.html', 5410, 'text/html', 'verified', NULL, '2026-10-03 21:31:39');
INSERT INTO `documents` (`id`, `user_id`, `shipment_id`, `vehicle_id`, `driver_id`, `document_type`, `file_name`, `file_path`, `file_size`, `mime_type`, `verification_status`, `rejection_reason`, `uploaded_at`) VALUES (5, 4, NULL, NULL, NULL, 'invoice', 'COMMERCIAL TAX INVOICE (FREIGHT) - INV-2026-7158.html', 'invoice_INV-2026-7158_b39103c2.html', 5361, 'text/html', 'verified', NULL, '2026-10-05 20:42:40');

-- -------------------------------------------------------------
-- Structure for table `messages`
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `messages`;
CREATE TABLE `messages` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `shipment_id` bigint NOT NULL,
  `sender_id` bigint NOT NULL,
  `receiver_id` bigint NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `message_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'text',
  `read_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sender_id` (`sender_id`),
  KEY `idx_msg_shipment` (`shipment_id`),
  KEY `idx_msg_receiver` (`receiver_id`,`is_read`),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`shipment_id`) REFERENCES `shipments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `messages_ibfk_3` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data records for `messages` (13 rows)
INSERT INTO `messages` (`id`, `shipment_id`, `sender_id`, `receiver_id`, `message`, `is_read`, `created_at`, `message_type`, `read_at`) VALUES (1, 1, 4, 2, 'Driver has gate pass #9910. Please ensure tarp is tied properly.', 1, '2026-10-03 20:57:28', 'text', NULL);
INSERT INTO `messages` (`id`, `shipment_id`, `sender_id`, `receiver_id`, `message`, `is_read`, `created_at`, `message_type`, `read_at`) VALUES (2, 2, 5, 6, 'Driver has unloading bay #4 reserved at Pune MIDC.', 0, '2026-10-03 21:01:14', 'text', NULL);
INSERT INTO `messages` (`id`, `shipment_id`, `sender_id`, `receiver_id`, `message`, `is_read`, `created_at`, `message_type`, `read_at`) VALUES (3, 2, 6, 5, 'Understood. Estimated arrival in 40 minutes.', 1, '2026-10-03 21:01:14', 'text', NULL);
INSERT INTO `messages` (`id`, `shipment_id`, `sender_id`, `receiver_id`, `message`, `is_read`, `created_at`, `message_type`, `read_at`) VALUES (4, 3, 4, 2, 'Good morning. Consignment loaded at JNPT dock 4. E-Way bill uploaded.', 0, '2026-10-03 21:13:14', 'text', NULL);
INSERT INTO `messages` (`id`, `shipment_id`, `sender_id`, `receiver_id`, `message`, `is_read`, `created_at`, `message_type`, `read_at`) VALUES (5, 3, 2, 4, 'Acknowledged. Driver Suresh has toll fastag active. Unloading dock 2 ready at Pune.', 0, '2026-10-03 21:13:14', 'text', NULL);
INSERT INTO `messages` (`id`, `shipment_id`, `sender_id`, `receiver_id`, `message`, `is_read`, `created_at`, `message_type`, `read_at`) VALUES (6, 7, 4, 2, 'Automated E2E Test Message from Dealer at 1791106745', 1, '2026-10-04 15:09:05', 'text', '2026-10-04 15:11:30');
INSERT INTO `messages` (`id`, `shipment_id`, `sender_id`, `receiver_id`, `message`, `is_read`, `created_at`, `message_type`, `read_at`) VALUES (7, 7, 4, 2, 'Automated E2E Test Message from Dealer at 1791106890', 1, '2026-10-04 15:11:30', 'text', '2026-10-04 15:11:30');
INSERT INTO `messages` (`id`, `shipment_id`, `sender_id`, `receiver_id`, `message`, `is_read`, `created_at`, `message_type`, `read_at`) VALUES (8, 7, 2, 4, 'Automated Transporter ACK reply at 1791106890', 1, '2026-10-04 15:11:30', 'text', '2026-10-05 20:43:28');
INSERT INTO `messages` (`id`, `shipment_id`, `sender_id`, `receiver_id`, `message`, `is_read`, `created_at`, `message_type`, `read_at`) VALUES (9, 7, 4, 2, 'Automated E2E Test Message from Dealer at 1791106927', 1, '2026-10-04 15:12:07', 'text', '2026-10-04 15:12:07');
INSERT INTO `messages` (`id`, `shipment_id`, `sender_id`, `receiver_id`, `message`, `is_read`, `created_at`, `message_type`, `read_at`) VALUES (10, 7, 2, 4, 'Automated Transporter ACK reply at 1791106927', 1, '2026-10-04 15:12:07', 'text', '2026-10-05 20:43:28');
INSERT INTO `messages` (`id`, `shipment_id`, `sender_id`, `receiver_id`, `message`, `is_read`, `created_at`, `message_type`, `read_at`) VALUES (11, 7, 4, 2, 'Automated E2E Test Message from Dealer at 1791211308', 1, '2026-10-05 20:11:48', 'text', '2026-10-05 20:11:48');
INSERT INTO `messages` (`id`, `shipment_id`, `sender_id`, `receiver_id`, `message`, `is_read`, `created_at`, `message_type`, `read_at`) VALUES (12, 7, 2, 4, 'Automated Transporter ACK reply at 1791211308', 1, '2026-10-05 20:11:48', 'text', '2026-10-05 20:43:28');
INSERT INTO `messages` (`id`, `shipment_id`, `sender_id`, `receiver_id`, `message`, `is_read`, `created_at`, `message_type`, `read_at`) VALUES (13, 1, 2, 4, 'Mobile responsive test message: driver dispatch verified!', 0, '2026-10-05 20:37:47', 'text', NULL);

-- -------------------------------------------------------------
-- Structure for table `notifications`
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `title` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `link` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_user` (`user_id`,`is_read`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data records for `notifications` (21 rows)
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (1, 2, 'New Shipment Request #1', 'A new cargo request for Industrial Steel Coils (18.5T) from JNPT Port, Navi Mumbai to Bhosari MIDC, Pune has been assigned to you by dealer@tranceconnect.com.', '/shipments/1', 0, '2026-10-03 20:57:28');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (2, 4, 'Shipment #1 is now Accepted', 'Your shipment of Industrial Steel Coils has been updated to ''Accepted''. Driver Ramesh Yadav assigned', '/shipments/1', 0, '2026-10-03 20:57:28');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (3, 4, 'Shipment #1 is now In Transit', 'Your shipment of Industrial Steel Coils has been updated to ''In Transit''. Departed from JNPT origin point', '/shipments/1', 0, '2026-10-03 20:57:28');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (4, 2, 'New Chat Message on Shipment #1', 'dealer@tranceconnect.com: Driver has gate pass #9910. Please ensure tarp is tied properly.', '/shipments/1', 0, '2026-10-03 20:57:28');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (5, 5, 'Welcome to TranceConnect-Prime!', 'Your account as Dealer has been successfully registered. Please upload your verification documents.', NULL, 0, '2026-10-03 21:01:13');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (6, 6, 'Welcome to TranceConnect-Prime!', 'Your account as Transporter has been successfully registered. Please upload your verification documents.', NULL, 0, '2026-10-03 21:01:13');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (7, 6, 'New Shipment Request #2', 'A new cargo request for Cold Rolled Steel Coils (22.0T) from JNPT Container Terminal, Navi Mumbai to Chakan Auto Hub, Pune has been assigned to you by vikram.steel@example.com.', '/shipments/2', 0, '2026-10-03 21:01:14');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (8, 5, 'Shipment #2 is now Accepted', 'Your shipment of Cold Rolled Steel Coils has been updated to ''Accepted''. Driver assigned and dispatched to loading terminal', '/shipments/2', 0, '2026-10-03 21:01:14');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (9, 5, 'Shipment #2 is now In Transit', 'Your shipment of Cold Rolled Steel Coils has been updated to ''In Transit''. Loaded 22T steel. Toll clearance in progress.', '/shipments/2', 0, '2026-10-03 21:01:14');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (10, 6, 'New Chat Message on Shipment #2', 'vikram.steel@example.com: Driver has unloading bay #4 reserved at Pune MIDC.', '/shipments/2', 0, '2026-10-03 21:01:14');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (11, 5, 'New Chat Message on Shipment #2', 'fastlane.freight@example.com: Understood. Estimated arrival in 40 minutes.', '/shipments/2', 0, '2026-10-03 21:01:14');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (12, 5, 'Shipment #2 is now Delivered', 'Your shipment of Cold Rolled Steel Coils has been updated to ''Delivered''. Received by Bay 4 Manager. Consignment delivered in intact condition.', '/shipments/2', 0, '2026-10-03 21:01:14');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (13, 5, 'Document Invoice Verified', 'Your uploaded invoice (commercial_invoice_991.pdf) was verified. Reason: Invoice numbers match GST portal records.', NULL, 0, '2026-10-03 21:01:14');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (14, 23, 'Welcome to TranceConnect-Prime!', 'Your account as Dealer has been successfully registered. Please upload your verification documents.', NULL, 0, '2026-10-03 21:21:46');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (15, 2, 'New Message on Consignment #7', 'Bharat Steel & Infrastructure Ltd: Automated E2E Test Message from Dealer at 1791106890', '/shipments/7', 0, '2026-10-04 15:11:30');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (16, 4, 'New Message on Consignment #7', 'Apex Logistics & Freight Corp: Automated Transporter ACK reply at 1791106890', '/shipments/7', 0, '2026-10-04 15:11:30');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (17, 2, 'New Message on Consignment #7', 'Bharat Steel & Infrastructure Ltd: Automated E2E Test Message from Dealer at 1791106927', '/shipments/7', 0, '2026-10-04 15:12:07');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (18, 4, 'New Message on Consignment #7', 'Apex Logistics & Freight Corp: Automated Transporter ACK reply at 1791106927', '/shipments/7', 0, '2026-10-04 15:12:07');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (19, 2, 'New Message on Consignment #7', 'Bharat Steel & Infrastructure Ltd: Automated E2E Test Message from Dealer at 1791211308', '/shipments/7', 0, '2026-10-05 20:11:48');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (20, 4, 'New Message on Consignment #7', 'Apex Logistics & Freight Corp: Automated Transporter ACK reply at 1791211308', '/shipments/7', 0, '2026-10-05 20:11:48');
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `link`, `is_read`, `created_at`) VALUES (21, 4, 'New Message on Consignment #1', 'Apex Logistics & Freight Corp: Mobile responsive test message: driver dispatch verified!', '/shipments/1', 0, '2026-10-05 20:37:47');

-- -------------------------------------------------------------
-- Structure for table `tracking_records`
-- -------------------------------------------------------------
DROP TABLE IF EXISTS `tracking_records`;
CREATE TABLE `tracking_records` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `shipment_id` bigint NOT NULL,
  `vehicle_id` bigint DEFAULT NULL,
  `latitude` decimal(10,6) NOT NULL,
  `longitude` decimal(10,6) NOT NULL,
  `location_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `speed_kmh` decimal(6,2) DEFAULT '0.00',
  `status_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recorded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `accuracy` float DEFAULT '15',
  `heading` float DEFAULT '0',
  `transporter_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `vehicle_id` (`vehicle_id`),
  KEY `idx_track_shipment` (`shipment_id`,`recorded_at`),
  CONSTRAINT `tracking_records_ibfk_1` FOREIGN KEY (`shipment_id`) REFERENCES `shipments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tracking_records_ibfk_2` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data records for `tracking_records` (14 rows)
INSERT INTO `tracking_records` (`id`, `shipment_id`, `vehicle_id`, `latitude`, `longitude`, `location_name`, `speed_kmh`, `status_note`, `recorded_at`, `accuracy`, `heading`, `transporter_id`) VALUES (1, 1, NULL, '19.076000', '72.877700', 'JNPT Port, Navi Mumbai', '0.00', 'Shipment Registered at Origin', '2026-10-03 20:57:28', 15.0, 0.0, NULL);
INSERT INTO `tracking_records` (`id`, `shipment_id`, `vehicle_id`, `latitude`, `longitude`, `location_name`, `speed_kmh`, `status_note`, `recorded_at`, `accuracy`, `heading`, `transporter_id`) VALUES (2, 1, 1, '19.076000', '72.877700', 'JNPT Port, Navi Mumbai', '0.00', 'Driver Ramesh Yadav assigned', '2026-10-03 20:57:28', 15.0, 0.0, NULL);
INSERT INTO `tracking_records` (`id`, `shipment_id`, `vehicle_id`, `latitude`, `longitude`, `location_name`, `speed_kmh`, `status_note`, `recorded_at`, `accuracy`, `heading`, `transporter_id`) VALUES (3, 1, 1, '19.076000', '72.877700', 'JNPT Port, Navi Mumbai', '0.00', 'Departed from JNPT origin point', '2026-10-03 20:57:28', 15.0, 0.0, NULL);
INSERT INTO `tracking_records` (`id`, `shipment_id`, `vehicle_id`, `latitude`, `longitude`, `location_name`, `speed_kmh`, `status_note`, `recorded_at`, `accuracy`, `heading`, `transporter_id`) VALUES (4, 1, 1, '18.989400', '73.120500', 'Mumbai-Pune Expressway Toll Plaza', '58.50', 'Cruising on expressway, speed normal', '2026-10-03 20:57:28', 15.0, 0.0, NULL);
INSERT INTO `tracking_records` (`id`, `shipment_id`, `vehicle_id`, `latitude`, `longitude`, `location_name`, `speed_kmh`, `status_note`, `recorded_at`, `accuracy`, `heading`, `transporter_id`) VALUES (5, 2, NULL, '19.076000', '72.877700', 'JNPT Container Terminal, Navi Mumbai', '0.00', 'Shipment Registered at Origin', '2026-10-03 21:01:14', 15.0, 0.0, NULL);
INSERT INTO `tracking_records` (`id`, `shipment_id`, `vehicle_id`, `latitude`, `longitude`, `location_name`, `speed_kmh`, `status_note`, `recorded_at`, `accuracy`, `heading`, `transporter_id`) VALUES (6, 2, NULL, '19.076000', '72.877700', 'JNPT Container Terminal, Navi Mumbai', '0.00', 'Driver assigned and dispatched to loading terminal', '2026-10-03 21:01:14', 15.0, 0.0, NULL);
INSERT INTO `tracking_records` (`id`, `shipment_id`, `vehicle_id`, `latitude`, `longitude`, `location_name`, `speed_kmh`, `status_note`, `recorded_at`, `accuracy`, `heading`, `transporter_id`) VALUES (7, 2, NULL, '19.076000', '72.877700', 'JNPT Container Terminal, Navi Mumbai', '0.00', 'Loaded 22T steel. Toll clearance in progress.', '2026-10-03 21:01:14', 15.0, 0.0, NULL);
INSERT INTO `tracking_records` (`id`, `shipment_id`, `vehicle_id`, `latitude`, `longitude`, `location_name`, `speed_kmh`, `status_note`, `recorded_at`, `accuracy`, `heading`, `transporter_id`) VALUES (8, 2, NULL, '18.753300', '73.407200', 'Khandala Ghat Checkpoint', '48.00', 'Navigating expressway ghat section safely', '2026-10-03 21:01:14', 15.0, 0.0, NULL);
INSERT INTO `tracking_records` (`id`, `shipment_id`, `vehicle_id`, `latitude`, `longitude`, `location_name`, `speed_kmh`, `status_note`, `recorded_at`, `accuracy`, `heading`, `transporter_id`) VALUES (9, 2, NULL, '19.076000', '72.877700', 'Chakan Auto Hub, Pune', '0.00', 'Received by Bay 4 Manager. Consignment delivered in intact condition.', '2026-10-03 21:01:14', 15.0, 0.0, NULL);
INSERT INTO `tracking_records` (`id`, `shipment_id`, `vehicle_id`, `latitude`, `longitude`, `location_name`, `speed_kmh`, `status_note`, `recorded_at`, `accuracy`, `heading`, `transporter_id`) VALUES (10, 3, 2, '18.753300', '73.407200', 'Khandala Ghat Checkpoint, Mumbai-Pune Expressway', '52.00', 'Live GPS telemetry streaming active', '2026-10-03 21:13:14', 15.0, 0.0, NULL);
INSERT INTO `tracking_records` (`id`, `shipment_id`, `vehicle_id`, `latitude`, `longitude`, `location_name`, `speed_kmh`, `status_note`, `recorded_at`, `accuracy`, `heading`, `transporter_id`) VALUES (11, 7, 1, '19.876200', '75.343300', 'Chhatrapati Sambhajinagar Expressway Toll Plaza', '78.50', 'En route, highway cruising at optimal speed', '2026-10-04 15:11:30', 10.0, 142.0, 2);
INSERT INTO `tracking_records` (`id`, `shipment_id`, `vehicle_id`, `latitude`, `longitude`, `location_name`, `speed_kmh`, `status_note`, `recorded_at`, `accuracy`, `heading`, `transporter_id`) VALUES (12, 7, 1, '19.876200', '75.343300', 'Chhatrapati Sambhajinagar Expressway Toll Plaza', '78.50', 'En route, highway cruising at optimal speed', '2026-10-04 15:12:07', 10.0, 142.0, 2);
INSERT INTO `tracking_records` (`id`, `shipment_id`, `vehicle_id`, `latitude`, `longitude`, `location_name`, `speed_kmh`, `status_note`, `recorded_at`, `accuracy`, `heading`, `transporter_id`) VALUES (13, 7, 1, '19.876200', '75.343300', 'Chhatrapati Sambhajinagar Expressway Toll Plaza', '78.50', 'En route, highway cruising at optimal speed', '2026-10-05 20:11:48', 10.0, 142.0, 2);
INSERT INTO `tracking_records` (`id`, `shipment_id`, `vehicle_id`, `latitude`, `longitude`, `location_name`, `speed_kmh`, `status_note`, `recorded_at`, `accuracy`, `heading`, `transporter_id`) VALUES (14, 1, 1, '18.989200', '73.120500', 'Panvel Highway Junction, Navi Mumbai', '62.40', 'Broadcasting live from mobile GPS', '2026-10-05 20:37:47', 5.0, 94.0, 2);

SET FOREIGN_KEY_CHECKS=1;
-- Dump completed successfully.