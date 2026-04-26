import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
};

export function PrimaryButton({ label, onPress, disabled, variant = 'primary' }: ButtonProps) {
  const styles = {
    primary: 'bg-pine',
    secondary: 'bg-butter',
    ghost: 'bg-white',
    danger: 'bg-clay',
    outline: 'border border-moss/25 bg-white',
  }[variant];

  const textStyles = {
    primary: 'text-white',
    secondary: 'text-ink',
    ghost: 'text-pine',
    danger: 'text-white',
    outline: 'text-ink',
  }[variant];

  return (
    <Pressable
      className={`min-h-12 items-center justify-center rounded-2xl px-4 ${styles} ${disabled ? 'opacity-50' : ''}`}
      disabled={disabled}
      onPress={onPress}
    >
      <Text className={`text-base font-semibold ${textStyles}`}>{label}</Text>
    </Pressable>
  );
}

type InputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric';
  secureTextEntry?: boolean;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
};

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  secureTextEntry,
  multiline,
  autoCapitalize = 'sentences',
}: InputProps) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-ink/70">{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        className={`rounded-2xl border border-moss/20 bg-white px-4 py-3 text-base text-ink ${multiline ? 'min-h-24' : ''}`}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8e9a92"
        secureTextEntry={secureTextEntry}
        value={value}
      />
    </View>
  );
}

export function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-4 rounded-[28px] border border-moss/10 bg-white p-5 shadow-card">
      <View className="gap-1">
        <Text className="font-display text-2xl text-pine">{title}</Text>
        {subtitle ? <Text className="text-sm leading-5 text-ink/65">{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function ModalSheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal animationType="slide" transparent visible={open}>
      <View className="flex-1 justify-end bg-ink/35">
        <SafeAreaView className="rounded-t-[32px] bg-oat px-5 pb-6 pt-4">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="font-display text-2xl text-pine">{title}</Text>
            <Pressable onPress={onClose}>
              <Text className="text-base font-semibold text-clay">Close</Text>
            </Pressable>
          </View>
          {children}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <View className="min-h-32 items-center justify-center gap-3">
      <ActivityIndicator color="#18332a" size="small" />
      <Text className="text-sm text-ink/65">{label}</Text>
    </View>
  );
}
