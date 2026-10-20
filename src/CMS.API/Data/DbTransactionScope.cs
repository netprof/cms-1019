using System.Transactions;

namespace CMS.API.Data;

/// <summary>
/// An ambient transaction spanning several repository calls. Connections opened inside it enlist
/// automatically. Open them one at a time (dispose each before the next opens): SQL Server then
/// reuses the pooled connection and the transaction stays local; two connections open at once
/// would need a distributed transaction, which .NET does not allow by default.
/// </summary>
public static class DbTransactionScope
{
    /// <summary>
    /// Joins the ambient transaction or starts one, at READ COMMITTED (the SQL Server default;
    /// <see cref="TransactionScope"/> would otherwise use SERIALIZABLE). Call <c>Complete()</c> to commit.
    /// </summary>
    public static TransactionScope Begin() => new(
        TransactionScopeOption.Required,
        new TransactionOptions { IsolationLevel = IsolationLevel.ReadCommitted },
        TransactionScopeAsyncFlowOption.Enabled);
}
