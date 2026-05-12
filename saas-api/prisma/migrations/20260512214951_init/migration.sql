-- CreateTable
CREATE TABLE `Kurum` (
    `id` VARCHAR(191) NOT NULL,
    `ad` VARCHAR(200) NOT NULL,
    `yetkili` VARCHAR(100) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `telefon` VARCHAR(30) NOT NULL,
    `sehir` VARCHAR(60) NOT NULL,
    `plan` ENUM('LITE', 'STANDART', 'PRO') NOT NULL DEFAULT 'LITE',
    `source` VARCHAR(50) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Kurum_email_key`(`email`),
    INDEX `Kurum_createdAt_idx`(`createdAt`),
    INDEX `Kurum_plan_idx`(`plan`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `License` (
    `id` VARCHAR(191) NOT NULL,
    `kurumId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(50) NOT NULL,
    `machineId` VARCHAR(100) NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `lastPingAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokeReason` VARCHAR(200) NULL,

    UNIQUE INDEX `License_key_key`(`key`),
    INDEX `License_kurumId_idx`(`kurumId`),
    INDEX `License_status_idx`(`status`),
    INDEX `License_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `kurumId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `method` ENUM('HAVALE', 'IYZICO', 'MANUEL', 'OTHER') NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `receiptUrl` VARCHAR(500) NULL,
    `invoiceNo` VARCHAR(50) NULL,
    `externalId` VARCHAR(100) NULL,
    `paidAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Payment_kurumId_idx`(`kurumId`),
    INDEX `Payment_status_idx`(`status`),
    INDEX `Payment_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `License` ADD CONSTRAINT `License_kurumId_fkey` FOREIGN KEY (`kurumId`) REFERENCES `Kurum`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_kurumId_fkey` FOREIGN KEY (`kurumId`) REFERENCES `Kurum`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

