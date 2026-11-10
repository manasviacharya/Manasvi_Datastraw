-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('PLANNED', 'COMP_OFF', 'SICK');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('REQUESTED', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "RosterStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "DayState" AS ENUM ('WORKING', 'WEEKLY_OFF', 'HOLIDAY', 'LEAVE', 'COMP_OFF');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('HARD', 'SOFT');

-- CreateEnum
CREATE TYPE "ViolationKind" AS ENUM ('STAFFING_SHORTFALL', 'COVERAGE_GAP', 'DOUBLE_BOOKED', 'NO_WEEKLY_OFF', 'PREFERENCE_OVERRIDDEN', 'CONSECUTIVE_DAYS');

-- CreateTable
CREATE TABLE "Pod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "code" TEXT NOT NULL,
    "podId" TEXT NOT NULL,
    "ledPodId" TEXT,
    "preferredWeeklyOff" INTEGER NOT NULL DEFAULT 0,
    "maxConsecutiveDays" INTEGER NOT NULL DEFAULT 6,
    "isPodLead" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerPodId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Process" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandProcess" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "weekdayMask" BOOLEAN[],
    "observesHolidays" BOOLEAN NOT NULL DEFAULT true,
    "minStaffPerDay" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "brandProcessId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leave" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'APPROVED',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Leave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roster" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "RosterStatus" NOT NULL DEFAULT 'DRAFT',
    "coveragePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "preferenceMetPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fairnessSpread" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shortfallPersonDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Roster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterDay" (
    "id" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "state" "DayState" NOT NULL,
    "reason" TEXT NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RosterDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Violation" (
    "id" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "date" TEXT,
    "severity" "Severity" NOT NULL,
    "kind" "ViolationKind" NOT NULL,
    "brandProcessId" TEXT,
    "employeeId" TEXT,
    "message" TEXT NOT NULL,
    "suggestion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Violation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pod_name_key" ON "Pod"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_code_key" ON "Employee"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_ledPodId_key" ON "Employee"("ledPodId");

-- CreateIndex
CREATE INDEX "Employee_podId_idx" ON "Employee"("podId");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_code_key" ON "Brand"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Process_name_key" ON "Process"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Process_code_key" ON "Process"("code");

-- CreateIndex
CREATE INDEX "BrandProcess_brandId_idx" ON "BrandProcess"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandProcess_brandId_processId_key" ON "BrandProcess"("brandId", "processId");

-- CreateIndex
CREATE INDEX "Assignment_brandProcessId_idx" ON "Assignment"("brandProcessId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_employeeId_brandProcessId_key" ON "Assignment"("employeeId", "brandProcessId");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "Leave_date_idx" ON "Leave"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Leave_employeeId_date_key" ON "Leave"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Roster_month_key" ON "Roster"("month");

-- CreateIndex
CREATE INDEX "Roster_month_idx" ON "Roster"("month");

-- CreateIndex
CREATE INDEX "RosterDay_rosterId_date_idx" ON "RosterDay"("rosterId", "date");

-- CreateIndex
CREATE INDEX "RosterDay_employeeId_idx" ON "RosterDay"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "RosterDay_rosterId_employeeId_date_key" ON "RosterDay"("rosterId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "Violation_rosterId_severity_idx" ON "Violation"("rosterId", "severity");

-- CreateIndex
CREATE INDEX "Violation_rosterId_kind_idx" ON "Violation"("rosterId", "kind");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_podId_fkey" FOREIGN KEY ("podId") REFERENCES "Pod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_ledPodId_fkey" FOREIGN KEY ("ledPodId") REFERENCES "Pod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_ownerPodId_fkey" FOREIGN KEY ("ownerPodId") REFERENCES "Pod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandProcess" ADD CONSTRAINT "BrandProcess_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandProcess" ADD CONSTRAINT "BrandProcess_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_brandProcessId_fkey" FOREIGN KEY ("brandProcessId") REFERENCES "BrandProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterDay" ADD CONSTRAINT "RosterDay_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "Roster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterDay" ADD CONSTRAINT "RosterDay_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "Roster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_brandProcessId_fkey" FOREIGN KEY ("brandProcessId") REFERENCES "BrandProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

