using System.Text.Json;
using AqualLifeStyle.Domain.AQGreen;

try
{
    using var input = new MemoryStream();
    using var stdin = Console.OpenStandardInput();
    // The executor already limits the authenticated decision to 64 KiB.
    var chunk = new byte[8192];
    int count;
    while ((count = stdin.Read(chunk, 0, chunk.Length)) != 0)
    {
        if (input.Length + count > 65536) throw new InvalidOperationException();
        input.Write(chunk, 0, count);
    }
    using var document = JsonDocument.Parse(input.ToArray());
    var decision = document.Deserialize<AQGreenD10Decision>(AQGreenB6CanonicalEvidence.Options)
        ?? throw new InvalidOperationException();
    Console.Out.WriteLine(AQGreenB6CanonicalEvidence.Digest(decision));
}
catch
{
    // Do not reveal decision bytes, .NET parser exceptions or path details.
    Environment.ExitCode = 1;
}
