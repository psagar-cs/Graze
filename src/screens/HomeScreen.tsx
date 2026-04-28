import { useAuth, useUser } from '@clerk/clerk-expo';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field, LoadingBlock, ModalSheet, PrimaryButton, SectionCard } from '../components/ui';
import { useGrazeData } from '../hooks/useGrazeData';
import { formatTime } from '../lib/dates';
import type { FoodLogFormValues, PantryFormValues, PantryItem } from '../types';
import { getSuggestionPreviews } from '../utils/suggestions';

type TabKey = 'today' | 'log' | 'pantry' | 'suggestions';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'log', label: 'Log' },
  { key: 'pantry', label: 'Pantry' },
  { key: 'suggestions', label: 'Next' },
];

const validateNumber = (value: string) => Number.isFinite(Number(value)) && value.trim() !== '';

export function HomeScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const {
    error,
    loading,
    pantryItems,
    profile,
    refresh,
    saveFoodLog,
    savePantryItem,
    saveTargets,
    submitting,
    todayLogs,
    todaySummary,
    togglePantryItem,
    emptyFoodLogForm,
    emptyPantryForm,
  } = useGrazeData();

  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [targetsCalories, setTargetsCalories] = useState('');
  const [targetsProtein, setTargetsProtein] = useState('');
  const [pantryModalOpen, setPantryModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [pantryForm, setPantryForm] = useState<PantryFormValues>(emptyPantryForm);
  const [logForm, setLogForm] = useState<FoodLogFormValues>(emptyFoodLogForm);

  const activePantry = pantryItems.filter((item) => item.is_active);
  const suggestionPreviews = getSuggestionPreviews(activePantry, todaySummary);

  const syncTargets = () => {
    if (!profile) {
      return;
    }

    setTargetsCalories(String(profile.daily_calorie_target));
    setTargetsProtein(String(profile.daily_protein_target));
  };

  useEffect(() => {
    if (!profile) {
      return;
    }

    setTargetsCalories(String(profile.daily_calorie_target));
    setTargetsProtein(String(profile.daily_protein_target));
  }, [profile?.daily_calorie_target, profile?.daily_protein_target]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-oat">
        <LoadingBlock label="Loading your pantry, targets, and today’s progress..." />
      </SafeAreaView>
    );
  }

  const openNewPantry = () => {
    setEditingItem(null);
    setPantryForm(emptyPantryForm());
    setPantryModalOpen(true);
  };

  const openEditPantry = (item: PantryItem) => {
    setEditingItem(item);
    setPantryForm({
      name: item.name,
      defaultServing: item.default_serving,
      caloriesPerServing: String(item.calories_per_serving),
      proteinPerServing: String(item.protein_per_serving),
      quantityLabel: item.quantity_label,
    });
    setPantryModalOpen(true);
  };

  const submitPantry = async () => {
    if (
      !pantryForm.name.trim() ||
      !pantryForm.defaultServing.trim() ||
      !validateNumber(pantryForm.caloriesPerServing) ||
      !validateNumber(pantryForm.proteinPerServing)
    ) {
      return;
    }

    await savePantryItem(pantryForm, editingItem);
    setPantryModalOpen(false);
    setEditingItem(null);
    setPantryForm(emptyPantryForm());
  };

  const startLogFromPantry = (item: PantryItem) => {
    setLogForm({
      pantryItemId: item.id,
      customName: item.name,
      servings: '1',
      calories: String(item.calories_per_serving),
      protein: String(item.protein_per_serving),
      notes: '',
    });
    setLogModalOpen(true);
  };

  const submitLog = async () => {
    const hasName = logForm.pantryItemId || logForm.customName.trim();

    if (!hasName || !validateNumber(logForm.servings) || !validateNumber(logForm.calories) || !validateNumber(logForm.protein)) {
      return;
    }

    await saveFoodLog(logForm);
    setLogModalOpen(false);
    setLogForm(emptyFoodLogForm());
  };

  const renderToday = () => (
    <View className="gap-4">
      <SectionCard subtitle="Set the two targets that matter in v1: calories and protein." title="Targets">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field
              keyboardType="numeric"
              label="Calories"
              onChangeText={setTargetsCalories}
              placeholder={String(profile?.daily_calorie_target ?? 3000)}
              value={targetsCalories}
            />
          </View>
          <View className="flex-1">
            <Field
              keyboardType="numeric"
              label="Protein (g)"
              onChangeText={setTargetsProtein}
              placeholder={String(profile?.daily_protein_target ?? 180)}
              value={targetsProtein}
            />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <PrimaryButton
              disabled={submitting || !validateNumber(targetsCalories) || !validateNumber(targetsProtein)}
              label={submitting ? 'Saving...' : 'Save targets'}
              onPress={() => saveTargets(targetsCalories, targetsProtein)}
            />
          </View>
          <View className="flex-1">
            <PrimaryButton label="Use current values" onPress={syncTargets} variant="ghost" />
          </View>
        </View>
      </SectionCard>

      <SectionCard subtitle="A quick glance at how much room is left today." title="Today so far">
        <View className="flex-row gap-3">
          <MetricCard
            label="Calories"
            progress={todaySummary.percentCalories}
            remaining={todaySummary.remainingCalories}
            value={todaySummary.consumedCalories}
          />
          <MetricCard
            label="Protein"
            progress={todaySummary.percentProtein}
            remaining={todaySummary.remainingProtein}
            value={todaySummary.consumedProtein}
          />
        </View>
      </SectionCard>

      <SectionCard subtitle="Most recent first so the app stays useful in the middle of the day." title="Recent entries">
        {todayLogs.length ? (
          <View className="gap-3">
            {todayLogs.map((entry) => (
              <View
                className="flex-row items-center justify-between rounded-2xl border border-moss/10 bg-oat px-4 py-3"
                key={entry.id}
              >
                <View className="flex-1 pr-3">
                  <Text className="text-base font-semibold text-ink">
                    {entry.pantry_item?.name ?? entry.custom_name ?? 'Food log'}
                  </Text>
                  <Text className="mt-1 text-sm text-ink/60">
                    {entry.servings} serving(s) • {formatTime(entry.logged_at)}
                  </Text>
                </View>
                <Text className="text-right text-sm font-semibold text-pine">
                  {entry.calories} cal{'\n'}
                  {entry.protein}g protein
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            actionLabel="Log first meal"
            description="Nothing logged yet today. Start with a pantry staple or add a manual entry."
            onPress={() => setLogModalOpen(true)}
            title="No entries yet"
          />
        )}
      </SectionCard>
    </View>
  );

  const renderLog = () => (
    <View className="gap-4">
      <SectionCard subtitle="One-tap logging from the staples you already keep around." title="Quick add">
        {activePantry.length ? (
          <View className="gap-3">
            {activePantry.map((item) => (
              <View
                className="flex-row items-center justify-between rounded-2xl border border-moss/10 bg-white px-4 py-3"
                key={item.id}
              >
                <View className="flex-1 pr-4">
                  <Text className="text-base font-semibold text-ink">{item.name}</Text>
                  <Text className="mt-1 text-sm text-ink/60">
                    {item.default_serving} • {item.calories_per_serving} cal • {item.protein_per_serving}g protein
                  </Text>
                </View>
                <PrimaryButton label="Log" onPress={() => startLogFromPantry(item)} />
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            actionLabel="Add pantry item"
            description="Your quick-add list appears here once you set up a few staple ingredients."
            onPress={openNewPantry}
            title="Pantry is empty"
          />
        )}
      </SectionCard>

      <SectionCard subtitle="Fallback for anything not already in the pantry." title="Manual entry">
        <PrimaryButton
          label="Add custom log"
          onPress={() => {
            setLogForm(emptyFoodLogForm());
            setLogModalOpen(true);
          }}
          variant="secondary"
        />
      </SectionCard>
    </View>
  );

  const renderPantry = () => (
    <View className="gap-4">
      <SectionCard subtitle="Staples should be easy to add, easy to tweak, and easy to hide." title="Your pantry">
        <View className="mb-1">
          <PrimaryButton label="Add pantry item" onPress={openNewPantry} />
        </View>
        {pantryItems.length ? (
          <View className="gap-3">
            {pantryItems.map((item) => (
              <View className="rounded-2xl border border-moss/10 bg-oat px-4 py-4" key={item.id}>
                <View className="flex-row items-start justify-between gap-4">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-ink">{item.name}</Text>
                    <Text className="mt-1 text-sm leading-5 text-ink/65">
                      {item.default_serving} • {item.calories_per_serving} cal • {item.protein_per_serving}g protein
                    </Text>
                    <Text className="mt-1 text-sm text-moss">
                      {item.quantity_label} • {item.is_active ? 'Active' : 'Archived'}
                    </Text>
                  </View>
                  <View className="w-24 gap-2">
                    <PrimaryButton label="Edit" onPress={() => openEditPantry(item)} variant="ghost" />
                    <PrimaryButton
                      label={item.is_active ? 'Archive' : 'Restore'}
                      onPress={() => togglePantryItem(item)}
                      variant={item.is_active ? 'danger' : 'secondary'}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            actionLabel="Create first item"
            description="Think chicken breast, yogurt, eggs, peanut butter, bread, rice, tinned fish."
            onPress={openNewPantry}
            title="No pantry items yet"
          />
        )}
      </SectionCard>
    </View>
  );

  const renderSuggestions = () => (
    <View className="gap-4">
      <SectionCard
        subtitle="This is an honest preview: real calorie/protein context, lightweight canned suggestions, no AI layer yet."
        title="What can I eat next?"
      >
        <View className="rounded-2xl bg-pine px-4 py-4">
          <Text className="text-sm uppercase tracking-[1.5px] text-white/70">Remaining today</Text>
          <Text className="mt-2 font-display text-3xl text-white">
            {todaySummary.remainingCalories} cal / {todaySummary.remainingProtein}g protein
          </Text>
        </View>
        <Text className="text-sm leading-5 text-ink/65">
          Suggestions lean on what’s in your pantry when possible, then fall back to preview cards so
          the app stays useful while the recommendation engine is still being built.
        </Text>
      </SectionCard>

      {suggestionPreviews.map((suggestion) => (
        <SectionCard key={suggestion.id} subtitle={suggestion.reason} title={suggestion.title}>
          <View className="flex-row items-center justify-between">
            <Text className="text-base text-ink/70">Effort: {suggestion.effortLabel}</Text>
            <Text className="rounded-full bg-butter px-3 py-1 text-xs font-semibold uppercase text-ink">
              Preview
            </Text>
          </View>
          <Text className="text-sm text-ink/70">
            Roughly {suggestion.estimatedCalories} calories and {suggestion.estimatedProtein}g protein.
          </Text>
        </SectionCard>
      ))}
    </View>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'log':
        return renderLog();
      case 'pantry':
        return renderPantry();
      case 'suggestions':
        return renderSuggestions();
      default:
        return renderToday();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-oat">
      <View className="flex-1">
        <View className="px-5 pb-3 pt-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="font-display text-4xl text-pine">Graze</Text>
              <Text className="mt-1 text-sm text-ink/65">
                {user?.primaryEmailAddress?.emailAddress ?? 'Signed in'}
              </Text>
            </View>
            <Pressable onPress={() => signOut()}>
              <Text className="text-sm font-semibold text-clay">Sign out</Text>
            </Pressable>
          </View>
          <View className="mt-5 flex-row rounded-full bg-white p-1">
            {tabs.map((tab) => (
              <Pressable
                className={`flex-1 rounded-full px-3 py-3 ${activeTab === tab.key ? 'bg-pine' : ''}`}
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text
                  className={`text-center text-sm font-semibold ${activeTab === tab.key ? 'text-white' : 'text-ink/65'}`}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <ScrollView contentContainerClassName="gap-4 px-5 pb-24 pt-2">
          {error ? (
            <View className="rounded-2xl border border-clay/20 bg-white px-4 py-3">
              <Text className="text-sm leading-5 text-clay">{error}</Text>
            </View>
          ) : null}

          {renderActiveTab()}

          <PrimaryButton label="Refresh from Supabase" onPress={() => refresh()} variant="ghost" />
        </ScrollView>
      </View>

      <ModalSheet
        onClose={() => {
          setPantryModalOpen(false);
          setEditingItem(null);
        }}
        open={pantryModalOpen}
        title={editingItem ? 'Edit pantry item' : 'Add pantry item'}
      >
        <View className="gap-4">
          <Field
            label="Name"
            onChangeText={(text) => setPantryForm((current) => ({ ...current, name: text }))}
            placeholder="Greek yogurt"
            value={pantryForm.name}
          />
          <Field
            label="Default serving"
            onChangeText={(text) => setPantryForm((current) => ({ ...current, defaultServing: text }))}
            placeholder="1 cup"
            value={pantryForm.defaultServing}
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                blurOnSubmit
                keyboardType="numeric"
                label="Calories"
                onChangeText={(text) => setPantryForm((current) => ({ ...current, caloriesPerServing: text }))}
                placeholder="220"
                returnKeyType="done"
                value={pantryForm.caloriesPerServing}
              />
            </View>
            <View className="flex-1">
              <Field
                blurOnSubmit
                keyboardType="numeric"
                label="Protein (g)"
                onChangeText={(text) => setPantryForm((current) => ({ ...current, proteinPerServing: text }))}
                placeholder="18"
                returnKeyType="done"
                value={pantryForm.proteinPerServing}
              />
            </View>
          </View>
          <Field
            label="Quantity note"
            onChangeText={(text) => setPantryForm((current) => ({ ...current, quantityLabel: text }))}
            placeholder="Usually keep 2 tubs"
            value={pantryForm.quantityLabel}
          />
          <PrimaryButton
            disabled={submitting}
            label={submitting ? 'Saving...' : editingItem ? 'Save changes' : 'Create item'}
            onPress={submitPantry}
          />
        </View>
      </ModalSheet>

      <ModalSheet
        onClose={() => {
          setLogModalOpen(false);
          setLogForm(emptyFoodLogForm());
        }}
        open={logModalOpen}
        title="Log food"
      >
        <View className="gap-4">
          {!logForm.pantryItemId ? (
            <Field
              label="Food name"
              onChangeText={(text) => setLogForm((current) => ({ ...current, customName: text }))}
              placeholder="Eggs and toast"
              value={logForm.customName}
            />
          ) : (
            <View className="rounded-2xl bg-white px-4 py-3">
              <Text className="text-sm font-medium text-ink/60">Pantry item</Text>
              <Text className="mt-1 text-base font-semibold text-ink">{logForm.customName}</Text>
            </View>
          )}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                blurOnSubmit
                keyboardType="numeric"
                label="Servings"
                onChangeText={(text) => setLogForm((current) => ({ ...current, servings: text }))}
                placeholder="1"
                returnKeyType="done"
                value={logForm.servings}
              />
            </View>
            <View className="flex-1">
              <Field
                blurOnSubmit
                keyboardType="numeric"
                label="Calories"
                onChangeText={(text) => setLogForm((current) => ({ ...current, calories: text }))}
                placeholder="450"
                returnKeyType="done"
                value={logForm.calories}
              />
            </View>
          </View>
          <Field
            blurOnSubmit
            keyboardType="numeric"
            label="Protein (g)"
            onChangeText={(text) => setLogForm((current) => ({ ...current, protein: text }))}
            placeholder="30"
            returnKeyType="done"
            value={logForm.protein}
          />
          <Field
            label="Notes"
            multiline
            onChangeText={(text) => setLogForm((current) => ({ ...current, notes: text }))}
            placeholder="Optional context"
            value={logForm.notes}
          />
          <PrimaryButton disabled={submitting} label={submitting ? 'Saving...' : 'Save log'} onPress={submitLog} />
        </View>
      </ModalSheet>
    </SafeAreaView>
  );
}

function MetricCard({
  label,
  progress,
  remaining,
  value,
}: {
  label: string;
  progress: number;
  remaining: number;
  value: number;
}) {
  return (
    <View className="flex-1 rounded-2xl bg-oat px-4 py-4">
      <Text className="text-sm font-medium uppercase tracking-[1px] text-ink/55">{label}</Text>
      <Text className="mt-2 font-display text-3xl text-pine">{value}</Text>
      <View className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <View className="h-full rounded-full bg-clay" style={{ width: `${progress}%` }} />
      </View>
      <Text className="mt-3 text-sm text-ink/65">{remaining} left today</Text>
    </View>
  );
}

function EmptyState({
  title,
  description,
  actionLabel,
  onPress,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View className="items-start gap-3 rounded-2xl border border-dashed border-moss/20 bg-oat px-4 py-5">
      <Text className="text-base font-semibold text-ink">{title}</Text>
      <Text className="text-sm leading-5 text-ink/65">{description}</Text>
      <PrimaryButton label={actionLabel} onPress={onPress} variant="secondary" />
    </View>
  );
}
