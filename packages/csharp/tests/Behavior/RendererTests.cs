using System.Text;
using TextHue;

public sealed class RendererTests
{
    [Fact]
    public void ResolutionsAndAssignmentsCompareByValue()
    {
        var first = new Renderer();
        var second = new Renderer();
        Assert.Equal(first.Resolve("research"), second.Resolve("research"));
        Assert.NotEqual(first.Resolve("design"), second.Resolve("research"));
        var a = first.Assign(["research", "design"]);
        var b = second.Assign(["design", "research"]);
        Assert.Equal(a, b);
        Assert.Equal(a.GetHashCode(), b.GetHashCode());
        Assert.Equal(a.Colors["design"], first.Assign(["design", "ops"], a.Assignments).Colors["design"]);
    }

    [Fact]
    public void MalformedInputAndOptionsHaveDifferentCodes()
    {
        var renderer = new Renderer();
        Assert.Equal("INVALID_TEXT", TextHueErrors.GetCode(
            Assert.Throws<EncoderFallbackException>(() => renderer.Resolve("\ud800"))));
        Assert.Equal("INVALID_OPTIONS", TextHueErrors.GetCode(
            Assert.Throws<EncoderFallbackException>(() => new Renderer(scope: "\ud800"))));
        Assert.Equal("INVALID_OPTIONS", TextHueErrors.GetCode(
            Assert.ThrowsAny<ArgumentException>(() => renderer.Hex("name", role: "unknown"))));
    }
}
