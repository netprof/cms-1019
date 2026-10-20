USE [CMS]
GO
/****** Object:  Table [dbo].[AppRole]    Script Date: 3/16/2026 3:57:19 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[AppRole](
	[pkid] [int] IDENTITY(1,1) NOT NULL,
	[RoleId] [nvarchar](200) NOT NULL,
	[RoleName] [nvarchar](200) NOT NULL,
	[PermissionLevel] [int] NOT NULL,
	[Description] [nvarchar](400) NULL,
 CONSTRAINT [PK_AppRole] PRIMARY KEY CLUSTERED 
(
	[RoleId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[AppUser]    Script Date: 3/16/2026 3:57:19 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[AppUser](
	[pkid] [int] IDENTITY(1,1) NOT NULL,
	[UserId] [nvarchar](200) NOT NULL,
	[UserName] [nvarchar](200) NOT NULL,
	[IsActive] [bit] NOT NULL,
	[PasswordHash] [nvarchar](800) NOT NULL,
	[PasswordUpdatedTime] [datetime] NULL,
 CONSTRAINT [PK_AppUser] PRIMARY KEY CLUSTERED 
(
	[UserId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[AppUserRole]    Script Date: 3/16/2026 3:57:19 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[AppUserRole](
	[pkid] [int] IDENTITY(1,1) NOT NULL,
	[UserId] [nvarchar](200) NOT NULL,
	[RoleId] [nvarchar](200) NOT NULL,
 CONSTRAINT [PK_AppUserRole] PRIMARY KEY CLUSTERED 
(
	[UserId] ASC,
	[RoleId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

/****** Object:  Table [dbo].[PublishStatus]    Script Date: 3/16/2026 3:57:19 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[PublishStatus](
	[pkid] [tinyint] NOT NULL,
	[Description] [nvarchar](50) NOT NULL,
	[IsDraft] [bit] NOT NULL,
	[IsPublished] [bit] NOT NULL,
	[IsDiscontinued] [bit] NOT NULL,
 CONSTRAINT [PK_PublishingStatus] PRIMARY KEY CLUSTERED 
(
	[pkid] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[RowAudit]    Script Date: 3/16/2026 3:57:19 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[RowAudit](
	[pkid] [int] IDENTITY(1,1) NOT NULL,
	[TableName] [varchar](50) NOT NULL,
	[UserName] [nvarchar](100) NOT NULL,
	[PrimaryKeyValues] [nvarchar](100) NOT NULL,
	[ActionType] [varchar](20) NOT NULL,
	[ActionDesc] [varchar](1000) NULL,
	[DateTime] [datetime] NOT NULL,
 CONSTRAINT [PK_RowAudit] PRIMARY KEY CLUSTERED 
(
	[pkid] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[SysConfig]    Script Date: 3/16/2026 3:57:19 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[SysConfig](
	[configKey] [nvarchar](200) NOT NULL,
	[configValue] [nvarchar](4000) NOT NULL,
 CONSTRAINT [PK_SysConfig] PRIMARY KEY CLUSTERED 
(
	[configKey] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ModelPrice]    Claude model prices, USD per million tokens ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ModelPrice](
	[Model] [nvarchar](100) NOT NULL,
	[EffectiveDate] [date] NOT NULL,
	[InputPrice] [decimal](18, 6) NOT NULL,
	[CacheWrite5mPrice] [decimal](18, 6) NOT NULL,
	[CacheWrite1hPrice] [decimal](18, 6) NOT NULL,
	[CacheReadPrice] [decimal](18, 6) NOT NULL,
	[OutputPrice] [decimal](18, 6) NOT NULL,
 CONSTRAINT [PK_ModelPrice] PRIMARY KEY CLUSTERED
(
	[Model] ASC,
	[EffectiveDate] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

GO
ALTER TABLE [dbo].[AppRole] ADD  CONSTRAINT [DF_AppRole_Privilege]  DEFAULT ((100)) FOR [PermissionLevel]
GO
ALTER TABLE [dbo].[AppUser] ADD  CONSTRAINT [DF_AppUser_IsActive]  DEFAULT ((1)) FOR [IsActive]
GO
ALTER TABLE [dbo].[AppUserRole]  WITH CHECK ADD  CONSTRAINT [FK_AppUserRole_AppRole] FOREIGN KEY([RoleId])
REFERENCES [dbo].[AppRole] ([RoleId])
GO
ALTER TABLE [dbo].[AppUserRole] CHECK CONSTRAINT [FK_AppUserRole_AppRole]
GO
ALTER TABLE [dbo].[AppUserRole]  WITH CHECK ADD  CONSTRAINT [FK_AppUserRole_AppUser] FOREIGN KEY([UserId])
REFERENCES [dbo].[AppUser] ([UserId])
GO
ALTER TABLE [dbo].[AppUserRole] CHECK CONSTRAINT [FK_AppUserRole_AppUser]
GO


GO
-- ModelPrice seed: Claude 5 family, official Anthropic first-party pricing
-- (https://platform.claude.com/docs/en/about-claude/pricing, read 2026-10-20).
-- Haiku 5.5 uses its <=100K-token prompt tier; prompts over 100K cost 5x.
INSERT INTO [dbo].[ModelPrice] ([Model], [EffectiveDate], [InputPrice], [CacheWrite5mPrice], [CacheWrite1hPrice], [CacheReadPrice], [OutputPrice]) VALUES
(N'claude-fable-5-1',  '2026-01-01', 10.00, 12.50, 20.00, 0.25, 50.00),
(N'claude-fable-5',    '2026-01-01', 10.00, 12.50, 20.00, 1.00, 50.00),
(N'claude-opus-5-5',   '2026-01-01',  4.00,  5.00,  8.00, 0.20, 20.00),
(N'claude-opus-5',     '2026-01-01',  5.00,  6.25, 10.00, 0.50, 25.00),
(N'claude-sonnet-5-5', '2026-01-01',  2.00,  2.50,  4.00, 0.10, 10.00),
(N'claude-sonnet-5',   '2026-01-01',  2.00,  2.50,  4.00, 0.20, 10.00),
(N'claude-haiku-5-5',  '2026-01-01',  0.10, 0.125,  0.20, 0.01,  0.50)
GO
