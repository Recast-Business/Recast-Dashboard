import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateCreator } from "@/hooks/useCreators";
import { PLATFORM_ORDER } from "./CreatorTable";

const CATEGORY_OPTIONS = [
  "Male Creator",
  "Male Streamer",
  "Female Creator",
  "Female Streamer",
];

interface Props {
  signed: boolean;
  triggerLabel?: string;
}

export function AddCreatorDialog({ signed, triggerLabel = "Add creator" }: Props) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState<string>("");
  const [country, setCountry] = React.useState("");
  const [tier, setTier] = React.useState("");
  const [contractTerms, setContractTerms] = React.useState("");
  const [socials, setSocials] = React.useState<Record<string, string>>({});

  const create = useCreateCreator();

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setCategory("");
    setCountry("");
    setTier("");
    setContractTerms("");
    setSocials({});
  }, [open]);

  function setSocial(platform: string, url: string) {
    setSocials((prev) => {
      const next = { ...prev };
      if (url.trim() === "") delete next[platform];
      else next[platform] = url.trim();
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await create.mutateAsync({
      name: name.trim(),
      category: category || null,
      signed,
      contract_terms: signed ? contractTerms : null,
      country: country || null,
      tier: tier || null,
      socials,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{signed ? "Add signed creator to Roster" : "Add creator to Leads"}</DialogTitle>
          <DialogDescription>
            Name is required. Fill socials for every platform the creator is on —
            empty fields are skipped.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="c-name">Name</Label>
              <Input
                id="c-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="c-category">
                  <SelectValue placeholder="Pick one…" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="c-country">Country</Label>
              <Input
                id="c-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. US, UK, ES"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-tier">Tier</Label>
              <Input
                id="c-tier"
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                placeholder="e.g. A, B, C"
              />
            </div>
          </div>
          {signed && (
            <div className="space-y-2">
              <Label htmlFor="c-contract">Contract terms</Label>
              <Input
                id="c-contract"
                value={contractTerms}
                onChange={(e) => setContractTerms(e.target.value)}
                placeholder="e.g. 2yr excl, 20%, link to signed PDF"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Socials (paste full URL)</Label>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORM_ORDER.map((p) => (
                <div key={p} className="space-y-1">
                  <Label htmlFor={`s-${p}`} className="text-[11px] capitalize text-muted-foreground">
                    {p}
                  </Label>
                  <Input
                    id={`s-${p}`}
                    value={socials[p] ?? ""}
                    onChange={(e) => setSocial(p, e.target.value)}
                    placeholder={placeholderFor(p)}
                    className="h-8 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
          {create.error ? (
            <p className="text-sm text-destructive">
              {(create.error as Error).message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending ? "Adding…" : "Add creator"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function placeholderFor(p: string): string {
  const map: Record<string, string> = {
    twitch: "https://twitch.tv/handle",
    kick: "https://kick.com/handle",
    instagram: "https://instagram.com/handle",
    tiktok: "https://tiktok.com/@handle",
    youtube: "https://youtube.com/@handle",
    twitter: "https://x.com/handle",
    facebook: "https://facebook.com/handle",
    snapchat: "https://snapchat.com/add/handle",
    threads: "https://threads.com/@handle",
    discord: "https://discord.com/invite/…",
    whop: "https://whop.com/handle",
  };
  return map[p] ?? "";
}
