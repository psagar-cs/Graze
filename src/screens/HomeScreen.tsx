import { useAuth, useUser } from '@clerk/clerk-expo';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field, LoadingBlock, ModalSheet, PrimaryButton, SectionCard } from '../components/ui';
import { useGrazeData } from '../hooks/useGrazeData';
import { formatTime } from '../lib/dates';
import { formatCalories, formatProtein } from '../lib/format';
import {
  formatAmountWithUnit,
  formatInventoryNumber,
  formatUnitLabel,
  getServingsInStock,
  hasAnyStock,
} from '../lib/inventory';
import { getSuggestions } from '../services/suggestionEngine';
import type {
  FoodLogFormValues,
  PantryCategory,
  PantryEffortLevel,
  PantryFormValues,
  PantryItem,
  PantryMealRole,
  PantryStockEntryMode,
  PantryUnit,
} from '../types';

type TabKey = 'today' | 'log' | 'pantry' | 'suggestions';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'log', label: 'Log' },
  { key: 'pantry', label: 'Pantry' },
  { key: 'suggestions', label: 'Next' },
];

const pantryCategoryOptions: { label: string; value: PantryCategory }[] = [
  { label: 'Protein', value: 'protein' },
  { label: 'Carb', value: 'carb' },
  { label: 'Fat', value: 'fat' },
  { label: 'Fruit', value: 'fruit' },
  { label: 'Vegetable', value: 'vegetable' },
  { label: 'Dairy', value: 'dairy' },
  { label: 'Condiment', value: 'condiment' },
  { label: 'Snack', value: 'snack' },
  { label: 'Other', value: 'other' },
];

const effortOptions: { label: string; value: PantryEffortLevel }[] = [
  { label: 'No prep', value: 'no_prep' },
  { label: 'Assemble', value: 'assemble' },
  { label: 'Microwave', value: 'microwave' },
  { label: 'Cook', value: 'cook' },
];

const mealRoleOptions: { label: string; value: PantryMealRole }[] = [
  { label: 'Main', value: 'main' },
  { label: 'Base', value: 'base' },
  { label: 'Topping', value: 'topping' },
  { label: 'Condiment', value: 'condiment' },
  { label: 'Snack', value: 'snack' },
];

const pantryUnitOptions: { label: string; value: PantryUnit }[] = [
  { label: 'Serving', value: 'serving' },
  { label: 'Cup', value: 'cup' },
  { label: 'Tbsp', value: 'tbsp' },
  { label: 'Tsp', value: 'tsp' },
  { label: 'Piece', value: 'piece' },
  { label: 'Can', value: 'can' },
  { label: 'Gram', value: 'gram' },
  { label: 'Ounce', value: 'ounce' },
  { label: 'Lb', value: 'pound' },
];

const stockEntryOptions: { label: string; value: PantryStockEntryMode }[] = [
  { label: 'Amount in stock', value: 'amount' },
  { label: 'Servings in stock', value: 'servings' },
];

const validateNumber = (value: string) => Number.isFinite(Number(value)) && value.trim() !== '';

const formatEffortLabel = (effortLevel: PantryEffortLevel) =>
  ({
    no_prep: 'No prep',
    assemble: 'Assemble',
    microwave: 'Microwave',
    cook: 'Cook',
  })[effortLevel];

export function HomeScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const {
    error,
    loading,
    pantryItems,
    profile,
    refresh,
    clearPantryStock,
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
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<string[]>([]);
  const [suggestionSeed, setSuggestionSeed] = useState(0);

  const activePantry = pantryItems.filter((item) => item.is_active);
  const stockedPantry = activePantry.filter((item) => hasAnyStock(item));
  const selectedPantryItem = pantryItems.find((item) => item.id === logForm.pantryItemId) ?? null;
  const suggestionResult = getSuggestions({
    pantryItems: activePantry,
    todayLogs,
    profile,
    todaySummary,
    now: new Date(),
    goal: 'balanced',
    excludedSuggestionIds: dismissedSuggestionIds,
    variationSeed: suggestionSeed,
  });

  useEffect(() => {
    setDismissedSuggestionIds([]);
    setSuggestionSeed(0);
  }, [
    activePantry.map((item) => `${item.id}:${item.updated_at}`).join('|'),
    todayLogs.map((entry) => `${entry.id}:${entry.updated_at}`).join('|'),
    profile?.daily_calorie_target,
    profile?.daily_protein_target,
  ]);

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
      servingAmount: String(item.serving_amount),
      servingUnit: item.serving_unit,
      stockEntryMode: 'amount',
      stockAmount: String(item.stock_amount),
      stockServings: String(getServingsInStock(item)),
      caloriesPerServing: String(item.calories_per_serving),
      proteinPerServing: String(item.protein_per_serving),
      quantityLabel: item.quantity_label,
      category: item.category,
      effortLevel: item.effort_level,
      mealRole: item.meal_role,
    });
    setPantryModalOpen(true);
  };

  const submitPantry = async () => {
    if (
      !pantryForm.name.trim() ||
      !validateNumber(pantryForm.servingAmount) ||
      !validateNumber(pantryForm.caloriesPerServing) ||
      !validateNumber(pantryForm.proteinPerServing) ||
      !(
        pantryForm.stockEntryMode === 'amount'
          ? validateNumber(pantryForm.stockAmount)
          : validateNumber(pantryForm.stockServings)
      )
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
      amountUsed: '',
      calories: String(item.calories_per_serving),
      protein: String(item.protein_per_serving),
      notes: '',
    });
    setLogModalOpen(true);
  };

  const suggestAgain = () => {
    const currentIds = suggestionResult.suggestions.map((suggestion) => suggestion.id);
    const nextExcludedIds = Array.from(new Set([...dismissedSuggestionIds, ...currentIds]));
    const nextSeed = suggestionSeed + 1;
    const nextResult = getSuggestions({
      pantryItems: activePantry,
      todayLogs,
      profile,
      todaySummary,
      now: new Date(),
      goal: 'balanced',
      excludedSuggestionIds: nextExcludedIds,
      variationSeed: nextSeed,
    });

    if (nextResult.suggestions.length) {
      setDismissedSuggestionIds(nextExcludedIds);
      setSuggestionSeed(nextSeed);
      return;
    }

    setDismissedSuggestionIds([]);
    setSuggestionSeed(nextSeed);
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
        {stockedPantry.length ? (
          <View className="gap-3">
            {stockedPantry.map((item) => (
              <View
                className="flex-row items-center justify-between rounded-2xl border border-moss/10 bg-white px-4 py-3"
                key={item.id}
              >
                <View className="flex-1 pr-4">
                  <Text className="text-base font-semibold text-ink">{item.name}</Text>
                  <Text className="mt-1 text-sm text-ink/60">
                    {item.default_serving} • {formatCalories(item.calories_per_serving)} • {formatProtein(item.protein_per_serving)}
                  </Text>
                  <Text className="mt-1 text-sm text-moss">
                    {formatAmountWithUnit(item.stock_amount, item.serving_unit)} in stock
                  </Text>
                </View>
                <PrimaryButton label="Log" onPress={() => startLogFromPantry(item)} />
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            actionLabel={activePantry.length ? 'Open pantry' : 'Add pantry item'}
            description={
              activePantry.length
                ? 'Your pantry has items, but none currently have stock available to log.'
                : 'Your quick-add list appears here once you set up a few staple ingredients.'
            }
            onPress={() => {
              if (activePantry.length) {
                setActiveTab('pantry');
                return;
              }

              openNewPantry();
            }}
            title={activePantry.length ? 'No stocked items' : 'Pantry is empty'}
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
                      {item.default_serving} • {formatCalories(item.calories_per_serving)} • {formatProtein(item.protein_per_serving)}
                    </Text>
                    <Text className="mt-1 text-sm text-moss">
                      {formatAmountWithUnit(item.stock_amount, item.serving_unit)} in stock • {formatInventoryNumber(getServingsInStock(item))} servings available
                    </Text>
                    <Text className="mt-1 text-sm text-moss">
                      {item.quantity_label} • {item.is_active ? 'Active' : 'Archived'}
                    </Text>
                    <Text className="mt-1 text-sm text-ink/55">
                      {item.category} • {formatEffortLabel(item.effort_level)} • {item.meal_role}
                    </Text>
                  </View>
                  <View className="w-28 gap-2">
                    <PrimaryButton label="Edit" onPress={() => openEditPantry(item)} variant="ghost" />
                    <PrimaryButton
                      label="Clear stock"
                      onPress={() => clearPantryStock(item)}
                      variant="outline"
                    />
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
        subtitle="Deterministic, pantry-based suggestions that favor realistic low-effort combinations over macro-perfect weirdness."
        title="What can I eat next?"
      >
        <View className="rounded-2xl bg-pine px-4 py-4">
          <Text className="text-sm uppercase tracking-[1.5px] text-white/70">Remaining today</Text>
          <Text className="mt-2 font-display text-3xl text-white">
            {todaySummary.remainingCalories} cal / {todaySummary.remainingProtein}g protein
          </Text>
        </View>
        {suggestionResult.caveats.length ? (
          <View className="gap-2 rounded-2xl bg-oat px-4 py-4">
            {suggestionResult.caveats.map((caveat) => (
              <Text className="text-sm leading-5 text-ink/65" key={caveat}>
                {caveat}
              </Text>
            ))}
          </View>
        ) : (
          <Text className="text-sm leading-5 text-ink/65">
            Suggestions are built only from active pantry items and ranked for effort, coherence, and what you still have left today.
          </Text>
        )}
        <PrimaryButton
          label={suggestionResult.suggestions.length ? 'Suggest again' : 'Refresh suggestions'}
          onPress={suggestAgain}
          variant="secondary"
        />
      </SectionCard>

      {suggestionResult.suggestions.length ? (
        suggestionResult.suggestions.map((suggestion) => (
          <SectionCard key={suggestion.id} subtitle={suggestion.description} title={suggestion.title}>
            <View className="flex-row flex-wrap gap-2">
              <InfoPill label={formatCalories(suggestion.estimatedCalories)} />
              <InfoPill label={formatProtein(suggestion.estimatedProtein)} />
              <InfoPill label={`${suggestion.estimatedPrepTimeMinutes} min`} />
              <InfoPill label={formatEffortLabel(suggestion.effortLevel)} />
            </View>
            <View className="gap-2">
              <Text className="text-sm font-semibold uppercase tracking-[1px] text-ink/55">Ingredients</Text>
              <Text className="text-sm leading-5 text-ink/75">{suggestion.ingredients.join(' • ')}</Text>
            </View>
            <View className="rounded-2xl bg-oat px-4 py-4">
              <Text className="text-sm font-semibold text-ink">Why this fits</Text>
              <Text className="mt-2 text-sm leading-5 text-ink/70">{suggestion.reason}</Text>
            </View>
            {suggestion.caveats.length ? (
              <View className="gap-2">
                {suggestion.caveats.map((caveat) => (
                  <Text className="text-sm leading-5 text-clay" key={caveat}>
                    {caveat}
                  </Text>
                ))}
              </View>
            ) : null}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <PrimaryButton
                  label="Not feeling it"
                  onPress={() =>
                    setDismissedSuggestionIds((current) => Array.from(new Set([...current, suggestion.id])))
                  }
                  variant="ghost"
                />
              </View>
              <View className="flex-1">
                <PrimaryButton label="Suggest again" onPress={suggestAgain} variant="secondary" />
              </View>
            </View>
          </SectionCard>
        ))
      ) : suggestionResult.emptyState ? (
        <EmptyState
          actionLabel={
            suggestionResult.emptyState.title === 'Targets needed first'
              ? 'Open today'
              : activePantry.length
                ? 'Open pantry'
                : 'Add pantry item'
          }
          description={suggestionResult.emptyState.description}
          onPress={() => {
            if (suggestionResult.emptyState?.title === 'Targets needed first') {
              setActiveTab('today');
              return;
            }

            if (activePantry.length) {
              setActiveTab('pantry');
              return;
            }

            openNewPantry();
          }}
          title={suggestionResult.emptyState.title}
        />
      ) : null}
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
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                blurOnSubmit
                keyboardType="numeric"
                label="Serving amount"
                onChangeText={(text) => setPantryForm((current) => ({ ...current, servingAmount: text }))}
                placeholder="1.5"
                returnKeyType="done"
                value={pantryForm.servingAmount}
              />
            </View>
            <View className="flex-1 gap-2">
              <OptionGroup
                label="Serving unit"
                onChange={(servingUnit) => setPantryForm((current) => ({ ...current, servingUnit }))}
                options={pantryUnitOptions}
                value={pantryForm.servingUnit}
              />
            </View>
          </View>
          <OptionGroup
            label="Stock entry"
            onChange={(stockEntryMode) => setPantryForm((current) => ({ ...current, stockEntryMode }))}
            options={stockEntryOptions}
            value={pantryForm.stockEntryMode}
          />
          <Field
            keyboardType="numeric"
            label={pantryForm.stockEntryMode === 'amount' ? `Amount in stock (${formatUnitLabel(pantryForm.servingUnit, 2)})` : 'Servings in stock'}
            onChangeText={(text) =>
              setPantryForm((current) => ({
                ...current,
                [current.stockEntryMode === 'amount' ? 'stockAmount' : 'stockServings']: text,
              }))
            }
            placeholder={pantryForm.stockEntryMode === 'amount' ? '12' : '8'}
            value={pantryForm.stockEntryMode === 'amount' ? pantryForm.stockAmount : pantryForm.stockServings}
          />
          <Text className="text-sm leading-5 text-ink/60">
            Default serving: {formatAmountWithUnit(Number(pantryForm.servingAmount || '0'), pantryForm.servingUnit)}
          </Text>
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
          <OptionGroup
            label="Category"
            onChange={(category) => setPantryForm((current) => ({ ...current, category }))}
            options={pantryCategoryOptions}
            value={pantryForm.category}
          />
          <OptionGroup
            label="Effort"
            onChange={(effortLevel) => setPantryForm((current) => ({ ...current, effortLevel }))}
            options={effortOptions}
            value={pantryForm.effortLevel}
          />
          <OptionGroup
            label="Meal role"
            onChange={(mealRole) => setPantryForm((current) => ({ ...current, mealRole }))}
            options={mealRoleOptions}
            value={pantryForm.mealRole}
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
              {selectedPantryItem ? (
                <Text className="mt-1 text-sm text-moss">
                  {formatAmountWithUnit(selectedPantryItem.stock_amount, selectedPantryItem.serving_unit)} available
                </Text>
              ) : null}
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
          {selectedPantryItem ? (
            <Field
              blurOnSubmit
              keyboardType="numeric"
              label={`Amount used (${formatUnitLabel(selectedPantryItem.serving_unit, 2)})`}
              onChangeText={(text) => setLogForm((current) => ({ ...current, amountUsed: text }))}
              placeholder={`Optional, defaults to ${formatInventoryNumber(Number(logForm.servings || '1') * selectedPantryItem.serving_amount)}`}
              returnKeyType="done"
              value={logForm.amountUsed}
            />
          ) : null}
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

function InfoPill({ label }: { label: string }) {
  return (
    <Text className="rounded-full bg-butter px-3 py-1 text-xs font-semibold uppercase text-ink">
      {label}
    </Text>
  );
}

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-ink/70">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <Pressable
            className={`rounded-full border px-3 py-2 ${value === option.value ? 'border-pine bg-pine' : 'border-moss/20 bg-white'}`}
            key={option.value}
            onPress={() => onChange(option.value)}
          >
            <Text className={`text-sm font-medium ${value === option.value ? 'text-white' : 'text-ink/70'}`}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
