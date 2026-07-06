-- One login (User) can own multiple Customer locations (a multi-restaurant owner).
-- Drop the 1:1 unique so several Customers may share a userId; keep a plain index
-- for the userId lookups the portal does on every request.
DROP INDEX "Customer_userId_key";
CREATE INDEX "Customer_userId_idx" ON "Customer"("userId");
