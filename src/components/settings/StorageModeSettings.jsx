import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HardDrive, Cloud, Lock, Loader2, ShieldCheck, ShieldOff, Eye, EyeOff, AlertCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import {
  getMode, setMode,
  isEncryptionEnabled, setEncryptionEnabled,
} from "@/lib/storageMode";
import { enableEncryption, disableEncryption, initLocalDb } from "@/lib/localDb";

export default function StorageModeSettings() {
  const mode = getMode();
  const encEnabled = isEncryptionEnabled();

  const [switchConfirmOpen, setSwitchConfirmOpen] = useState(false);
  const [switchTarget, setSwitchTarget] = useState(null); // 'local' or 'cloud'
  const [showPasswordForm, setShowPasswordForm] = useState(null); // 'enable' | 'disable' | 'change'
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const confirmSwitch = () => {
    setSwitchConfirmOpen(true);
  };

  const handleSwitchToCloud = () => {
    setSwitchConfirmOpen(false);
    setMode("cloud");
    window.location.reload();
  };

  const handleSwitchToLocal = async () => {
    setSwitchConfirmOpen(false);
    setMode("local");
    setEncryptionEnabled(false);
    await initLocalDb(null);
    window.location.reload();
  };

  const promptSwitch = (target) => {
    setSwitchTarget(target);
    confirmSwitch();
  };

  const handleEnableEncryption = async () => {
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      await enableEncryption(newPassword);
      setEncryptionEnabled(true);
      setSuccess("Encryption enabled! Your data is now protected.");
      setShowPasswordForm(null);
      setNewPassword(""); setConfirmPassword("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleDisableEncryption = async () => {
    setLoading(true);
    try {
      await disableEncryption(oldPassword);
      setEncryptionEnabled(false);
      setSuccess("Encryption disabled. Data saved as plain text.");
      setShowPasswordForm(null);
      setOldPassword("");
    } catch { setError("Incorrect password."); }
    finally { setLoading(false); }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      await disableEncryption(oldPassword); // decrypt with old
      await enableEncryption(newPassword);  // re-encrypt with new
      setSuccess("Password changed successfully.");
      setShowPasswordForm(null);
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch { setError("Incorrect current password."); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setShowPasswordForm(null);
    setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    setError(""); setSuccess("");
  };

  return (
    <>
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            {mode === 'local' ? <HardDrive className="w-5 h-5 text-primary" /> : <Cloud className="w-5 h-5 text-primary" />}
          </div>
          <div>
            <CardTitle className="text-lg">Data Storage</CardTitle>
            <CardDescription>
              Currently: <span className="font-medium text-foreground capitalize">{mode === 'local' ? 'Local only' : 'Cloud sync'}</span>
              {mode === 'local' && encEnabled && <span className="ml-2 text-xs text-primary">🔒 Encrypted</span>}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {success && <p className="text-sm text-green-600 bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2">{success}</p>}
        {error && <p className="text-sm text-destructive bg-destructive/5 rounded-lg px-3 py-2">{error}</p>}

        {mode === 'local' ? (
          <>
            <div className="text-sm text-muted-foreground bg-muted/40 rounded-xl p-3">
              Your data lives exclusively on this device. No internet connection or account required.
            </div>

            {/* Encryption controls */}
            {!showPasswordForm && (
              <div className="flex gap-2">
                {!encEnabled ? (
                  <Button variant="outline" onClick={() => { setShowPasswordForm('enable'); setError(""); setSuccess(""); }} className="flex-1 gap-2">
                    <Lock className="w-4 h-4" /> Enable Encryption
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => { setShowPasswordForm('change'); setError(""); setSuccess(""); }} className="flex-1 gap-2">
                      <ShieldCheck className="w-4 h-4" /> Change Password
                    </Button>
                    <Button variant="outline" onClick={() => { setShowPasswordForm('disable'); setError(""); setSuccess(""); }} className="gap-2 text-destructive hover:text-destructive">
                      <ShieldOff className="w-4 h-4" /> Remove
                    </Button>
                  </>
                )}
              </div>
            )}

            {showPasswordForm === 'enable' && (
              <div className="space-y-3 rounded-xl border border-border/50 p-3">
                <Label>New Password</Label>
                <div className="relative">
                  <Input type={showPass ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Password..." className="pr-10" />
                  <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><Eye className="w-4 h-4" /></button>
                </div>
                <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm password..." />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetForm} className="flex-1">Cancel</Button>
                  <Button onClick={handleEnableEncryption} disabled={loading} className="flex-1 bg-primary hover:bg-primary/90">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enable"}
                  </Button>
                </div>
              </div>
            )}

            {showPasswordForm === 'disable' && (
              <div className="space-y-3 rounded-xl border border-destructive/30 p-3">
                <Label>Current Password</Label>
                <Input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} placeholder="Enter current password..." />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetForm} className="flex-1">Cancel</Button>
                  <Button onClick={handleDisableEncryption} disabled={loading} className="flex-1 bg-destructive hover:bg-destructive/90 text-white">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Remove Encryption"}
                  </Button>
                </div>
              </div>
            )}

            {showPasswordForm === 'change' && (
              <div className="space-y-3 rounded-xl border border-border/50 p-3">
                <Label>Current Password</Label>
                <Input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} placeholder="Current password..." />
                <Label>New Password</Label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password..." />
                <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password..." />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetForm} className="flex-1">Cancel</Button>
                  <Button onClick={handleChangePassword} disabled={loading} className="flex-1 bg-primary hover:bg-primary/90">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Change Password"}
                  </Button>
                </div>
              </div>
            )}

            <Button variant="ghost" onClick={() => promptSwitch('cloud')} className="w-full gap-2 text-muted-foreground hover:text-foreground text-sm">
              <Cloud className="w-4 h-4" /> Switch to Cloud Sync (requires account)
            </Button>
          </>
        ) : (
          <>
            <div className="text-sm text-muted-foreground bg-muted/40 rounded-xl p-3">
              Your data is synced to the cloud and accessible from any device.
            </div>
            <Button variant="outline" onClick={() => promptSwitch('local')} className="w-full gap-2">
              <HardDrive className="w-4 h-4" /> Switch to Local Only
            </Button>
          </>
        )}
        </CardContent>
        </Card>

        <Dialog open={switchConfirmOpen} onOpenChange={setSwitchConfirmOpen}>
        <DialogContent>
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             <AlertCircle className="w-5 h-5 text-amber-600" />
             Backup Your Data First
           </DialogTitle>
         </DialogHeader>
         <DialogDescription className="space-y-2">
           <p>You're about to switch from <strong>{mode === 'local' ? 'Local' : 'Cloud'}</strong> to <strong>{switchTarget === 'local' ? 'Local' : 'Cloud'}</strong>.</p>
           <p>⚠️ <strong>Please backup your data before switching</strong> — use "Backup & Export" below to save a full copy.</p>
           <p className="text-xs text-muted-foreground">After switching, you can import your data if needed.</p>
         </DialogDescription>
         <DialogFooter className="flex gap-2">
           <Button variant="outline" onClick={() => setSwitchConfirmOpen(false)}>Cancel</Button>
           <Button onClick={switchTarget === 'local' ? handleSwitchToLocal : handleSwitchToCloud} className="bg-primary">
             Continue
           </Button>
         </DialogFooter>
         </DialogContent>
         </Dialog>
         </>
         );
         }