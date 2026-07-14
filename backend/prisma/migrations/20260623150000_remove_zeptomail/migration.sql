-- Remove suporte à API ZeptoMail: o envio passa a ser exclusivamente via SMTP.
ALTER TABLE "EmailSettings" DROP COLUMN "provider";
ALTER TABLE "EmailSettings" DROP COLUMN "apiKey";
