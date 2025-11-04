import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function DirectWordPressPublisher() {
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("Test Article Title");
  const [content, setContent] = useState(`# Test Article

This is a **test article** with some *formatting*.

## Key Points

* Point one with some details
* Point two with more information
* Point three for completeness

Here's a regular paragraph with some text.

### Conclusion

This concludes our test article.`);
  const [publishing, setPublishing] = useState(false);

  const publishDirectly = async () => {
    if (!siteUrl || !username || !password || !title || !content) {
      toast.error("Please fill in all fields");
      return;
    }

    const formattedUrl = siteUrl.trim().match(/^https?:\/\//) 
      ? siteUrl.trim() 
      : `https://${siteUrl.trim()}`;

    setPublishing(true);
    try {
      // Format content for WordPress
      let formattedContent = content;
      
      // Convert markdown-style formatting to HTML
      formattedContent = formattedContent
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
        .replace(/^#{1}\s+(.*)$/gm, '<h1>$1</h1>') // H1
        .replace(/^#{2}\s+(.*)$/gm, '<h2>$1</h2>') // H2
        .replace(/^#{3}\s+(.*)$/gm, '<h3>$1</h3>') // H3
        .replace(/^\* (.*)$/gm, '<li>$1</li>') // List items
        .replace(/\n\n/g, '</p><p>') // Paragraphs
        .trim();

      // Wrap in paragraphs
      if (!formattedContent.startsWith('<')) {
        formattedContent = '<p>' + formattedContent + '</p>';
      }

      // Fix list formatting
      formattedContent = formattedContent
        .replace(/(<li>.*?<\/li>)/gs, (match) => {
          const items = match.match(/<li>.*?<\/li>/g);
          return '<ul>' + items?.join('') + '</ul>';
        })
        .replace(/<\/ul>\s*<ul>/g, '')
        .replace(/<p>\s*<ul>/g, '<ul>')
        .replace(/<\/ul>\s*<\/p>/g, '</ul>');

      const apiUrl = `${formattedUrl}/wp-json/wp/v2/posts`;
      const authHeader = `Basic ${btoa(`${username}:${password}`)}`;

      console.log("Publishing to WordPress:");
      console.log("- URL:", apiUrl);
      console.log("- Title:", title);
      console.log("- Content:", formattedContent);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          title: title,
          content: formattedContent,
          status: "publish",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`WordPress API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      console.log("WordPress Response:", data);
      
      toast.success(`Post published successfully! Post ID: ${data.id}`);
      toast.info(`View at: ${data.link}`);
    } catch (error: any) {
      console.error("Publish error:", error);
      toast.error("Failed to publish: " + error.message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Direct WordPress Publisher</CardTitle>
        <CardDescription>
          Test direct publishing to WordPress with proper formatting
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="siteUrl">Site URL</Label>
            <Input
              id="siteUrl"
              placeholder="https://yoursite.com"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              placeholder="WordPress username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        </div>
        
        <div>
          <Label htmlFor="password">Application Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Application password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="title">Post Title</Label>
          <Input
            id="title"
            placeholder="Article title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="content">Post Content (Markdown)</Label>
          <Textarea
            id="content"
            placeholder="Enter your content with markdown formatting"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
          />
        </div>

        <Button 
          onClick={publishDirectly} 
          disabled={publishing}
          className="w-full"
        >
          {publishing ? "Publishing..." : "Publish to WordPress"}
        </Button>
      </CardContent>
    </Card>
  );
}