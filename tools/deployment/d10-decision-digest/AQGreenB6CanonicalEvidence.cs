using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace AqualLifeStyle.Domain.AQGreen
{
    // Exact canonical JSON implementation from the pinned application Core blob.
    public static class AQGreenB6CanonicalEvidence
    {
        public static readonly JsonSerializerOptions Options = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            UnmappedMemberHandling = System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow
        };

        public static byte[] Bytes<T>(T value, string excludedProperty = null)
        {
            var node = JsonSerializer.SerializeToNode(value, Options);
            if (excludedProperty != null && node is JsonObject obj) obj.Remove(excludedProperty);
            using var stream = new MemoryStream();
            using (var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Indented = false }))
                WriteSorted(writer, node);
            return stream.ToArray();
        }

        public static string Digest<T>(T value, string excludedProperty = null) => Hash(Bytes(value, excludedProperty));
        public static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

        public static string Tuples(IEnumerable<IEnumerable<string>> values)
        {
            var rows = values.Select(row => row.ToArray())
                .OrderBy(row => string.Join('\0', row), StringComparer.Ordinal);
            using var stream = new MemoryStream();
            stream.Write(Encoding.ASCII.GetBytes("B6TUPLE1\n"));
            foreach (var row in rows)
            {
                stream.WriteByte((byte)'R');
                foreach (var value in row)
                {
                    if (value == @"\N") stream.WriteByte((byte)'N');
                    else
                    {
                        var bytes = Encoding.UTF8.GetBytes(value);
                        stream.Write(Encoding.ASCII.GetBytes($"V{bytes.Length}:"));
                        stream.Write(bytes);
                    }
                }
                stream.WriteByte((byte)'\n');
            }
            return Hash(stream.ToArray());
        }

        private static void WriteSorted(Utf8JsonWriter writer, JsonNode node)
        {
            switch (node)
            {
                case null: writer.WriteNullValue(); return;
                case JsonObject obj:
                    writer.WriteStartObject();
                    foreach (var item in obj.OrderBy(value => value.Key, StringComparer.Ordinal))
                    {
                        writer.WritePropertyName(item.Key);
                        WriteSorted(writer, item.Value);
                    }
                    writer.WriteEndObject(); return;
                case JsonArray array:
                    writer.WriteStartArray();
                    foreach (var item in array) WriteSorted(writer, item);
                    writer.WriteEndArray(); return;
                case JsonValue value: value.WriteTo(writer); return;
                default: throw new InvalidOperationException("Unsupported canonical evidence node.");
            }
        }
    }
}
