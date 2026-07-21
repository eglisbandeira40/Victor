-- CreateEnum
CREATE TYPE "StatusGateway" AS ENUM ('NAO_CONFIGURADO', 'PENDENTE', 'ATIVO', 'REJEITADO');

-- AlterTable
ALTER TABLE "Cliente" DROP COLUMN "asaasCustomerId",
ADD COLUMN     "gatewayCustomerId" TEXT;

-- AlterTable
ALTER TABLE "Cobranca" ADD COLUMN     "publicToken" TEXT NOT NULL,
ADD COLUMN     "qrCodeImagem" TEXT;

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "gatewayAccountId" TEXT,
ADD COLUMN     "gatewayApiKey" TEXT,
ADD COLUMN     "gatewayStatus" "StatusGateway" NOT NULL DEFAULT 'NAO_CONFIGURADO',
ADD COLUMN     "gatewayWalletId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Cobranca_publicToken_key" ON "Cobranca"("publicToken");

