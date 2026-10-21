/****** Upgrade an existing CMS database: TokenUsage.SessionName (safe to run more than once) ******/
USE [CMS]
GO
IF COL_LENGTH(N'dbo.TokenUsage', N'SessionName') IS NULL
	ALTER TABLE [dbo].[TokenUsage] ADD [SessionName] [nvarchar](200) NULL
GO
