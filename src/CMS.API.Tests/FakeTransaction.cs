using System.Transactions;

namespace CMS.API.Tests;

/// <summary>
/// Lets in-memory fakes honour an ambient <see cref="TransactionScope"/>, as SQL Server does:
/// a fake registers how to undo each write, and the undo runs if the scope rolls back.
/// </summary>
public static class FakeTransaction
{
    public static void OnRollback(Action undo) =>
        Transaction.Current?.EnlistVolatile(new UndoEnlistment(undo), EnlistmentOptions.None);

    private sealed class UndoEnlistment(Action undo) : IEnlistmentNotification
    {
        public void Prepare(PreparingEnlistment enlistment) => enlistment.Prepared();
        public void Commit(Enlistment enlistment) => enlistment.Done();
        public void InDoubt(Enlistment enlistment) => enlistment.Done();

        public void Rollback(Enlistment enlistment)
        {
            undo();
            enlistment.Done();
        }
    }
}
