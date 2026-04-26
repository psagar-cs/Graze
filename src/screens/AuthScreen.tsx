import { useOAuth, useSignIn, useSignUp } from '@clerk/clerk-expo';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field, PrimaryButton, SectionCard } from '../components/ui';

type Mode = 'sign-in' | 'sign-up' | 'verify';

export function AuthScreen() {
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp } = useSignUp();
  const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const getErrorMessage = (authError: any, fallback: string) =>
    authError?.errors?.[0]?.longMessage ?? fallback;

  const submitSignIn = async () => {
    if (!signInLoaded || !setActive) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      }
    } catch (authError: any) {
      setError(getErrorMessage(authError, 'Unable to sign in.'));
    } finally {
      setBusy(false);
    }
  };

  const submitSignUp = async () => {
    if (!signUpLoaded) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await signUp.create({
        emailAddress: email.trim(),
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setMode('verify');
    } catch (authError: any) {
      setError(getErrorMessage(authError, 'Unable to start sign up.'));
    } finally {
      setBusy(false);
    }
  };

  const submitVerification = async () => {
    if (!signUpLoaded || !setActive) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      }
    } catch (authError: any) {
      setError(getErrorMessage(authError, 'Verification failed.'));
    } finally {
      setBusy(false);
    }
  };

  const submitGoogle = async () => {
    if (!setActive) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await startOAuthFlow();

      if (result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        return;
      }

      if (result.authSessionResult?.type === 'cancel') {
        setError('Google sign-in was canceled.');
        return;
      }

      if (result.authSessionResult?.type !== 'success') {
        setError('Google sign-in did not complete.');
      }
    } catch (authError: any) {
      setError(getErrorMessage(authError, 'Unable to continue with Google.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-oat">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView contentContainerClassName="flex-grow px-5 py-6">
          <View className="flex-1 justify-center gap-6">
            <View className="gap-3">
              <Text className="font-display text-5xl text-pine">Graze</Text>
              <Text className="max-w-sm text-base leading-6 text-ink/70">
                A pantry-aware daily eating assistant for the moments when you need clean calories
                without another decision spiral.
              </Text>
            </View>

            <SectionCard
              subtitle="Real auth is wired through Clerk. Use Google or email/password. For sign-up, Clerk will email a one-time verification code."
              title={mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Verify email'}
            >
              {mode !== 'verify' ? (
                <>
                  <PrimaryButton
                    disabled={busy}
                    label={busy ? 'Opening Google...' : 'Continue with Google'}
                    onPress={submitGoogle}
                    variant="outline"
                  />

                  <View className="flex-row items-center gap-3 py-1">
                    <View className="h-px flex-1 bg-moss/20" />
                    <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-ink/45">
                      or use email
                    </Text>
                    <View className="h-px flex-1 bg-moss/20" />
                  </View>

                  <Field
                    autoCapitalize="none"
                    keyboardType="email-address"
                    label="Email"
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    value={email}
                  />
                  <Field
                    autoCapitalize="none"
                    label="Password"
                    onChangeText={setPassword}
                    placeholder="At least 8 characters"
                    secureTextEntry
                    value={password}
                  />
                </>
              ) : (
                <Field
                  autoCapitalize="none"
                  keyboardType="numeric"
                  label="Verification code"
                  onChangeText={setCode}
                  placeholder="123456"
                  value={code}
                />
              )}

              {error ? <Text className="text-sm leading-5 text-clay">{error}</Text> : null}

              {mode === 'sign-in' ? (
                <PrimaryButton
                  disabled={busy}
                  label={busy ? 'Signing in...' : 'Sign in with email'}
                  onPress={submitSignIn}
                />
              ) : null}

              {mode === 'sign-up' ? (
                <PrimaryButton
                  disabled={busy}
                  label={busy ? 'Creating account...' : 'Create account'}
                  onPress={submitSignUp}
                />
              ) : null}

              {mode === 'verify' ? (
                <PrimaryButton
                  disabled={busy}
                  label={busy ? 'Checking code...' : 'Verify and continue'}
                  onPress={submitVerification}
                />
              ) : null}

              <View className="flex-row flex-wrap gap-4">
                {mode !== 'sign-in' ? (
                  <Pressable onPress={() => setMode('sign-in')}>
                    <Text className="text-sm font-semibold text-pine">Back to sign in</Text>
                  </Pressable>
                ) : null}

                {mode === 'sign-in' ? (
                  <Pressable onPress={() => setMode('sign-up')}>
                    <Text className="text-sm font-semibold text-clay">Need an account?</Text>
                  </Pressable>
                ) : null}
              </View>
            </SectionCard>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
