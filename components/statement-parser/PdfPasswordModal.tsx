"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Props = {
  fileName: string | null; // null = closed
  incorrect: boolean; // the last password was wrong
  onSubmit: (password: string) => void;
  onCancel: () => void;
};

export function PdfPasswordModal({ fileName, incorrect, onSubmit, onCancel }: Props) {
  return (
    <Dialog open={fileName !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        {/* keyed so the field clears for each new file or retry */}
        {fileName !== null && (
          <PasswordForm key={`${fileName}-${incorrect}`} fileName={fileName} incorrect={incorrect} onSubmit={onSubmit} onCancel={onCancel} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PasswordForm({ fileName, incorrect, onSubmit, onCancel }: Props & { fileName: string }) {
  const [password, setPassword] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (password) onSubmit(password);
      }}
      className="grid gap-4"
    >
      <DialogHeader>
        <span className="mb-1 flex size-10 items-center justify-center rounded-xl bg-accent">
          <KeyRound className="size-5 text-info" />
        </span>
        <DialogTitle>This statement is password protected</DialogTitle>
        <DialogDescription>
          Enter the password for <span className="font-medium text-foreground">{fileName}</span>. It&apos;s used once
          to open the file and is never stored.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Input
          type="password"
          autoFocus
          autoComplete="off"
          placeholder="PDF password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={incorrect || undefined}
          aria-describedby={incorrect ? "pdf-password-error" : undefined}
        />
        {incorrect && (
          <p id="pdf-password-error" className="text-sm text-destructive">
            That password didn&apos;t work. Try again.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Skip this file
        </Button>
        <Button type="submit" disabled={!password}>
          Unlock and upload
        </Button>
      </DialogFooter>
    </form>
  );
}
