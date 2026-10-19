using System.Data.Common;
using Microsoft.Data.SqlClient;

namespace CMS.API.Data;

public interface IDbConnectionFactory
{
    Task<DbConnection> CreateOpenConnectionAsync();
}

public class SqlConnectionFactory(IConfiguration configuration) : IDbConnectionFactory
{
    private readonly string _connectionString = configuration.GetConnectionString("Default")
        ?? throw new InvalidOperationException("Connection string 'Default' is not configured.");

    public async Task<DbConnection> CreateOpenConnectionAsync()
    {
        var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        return connection;
    }
}
