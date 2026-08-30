/**
 * Shared helpers for a user's savings goal. Used by registration
 * (authController), the settings page, and the dashboard, so the three
 * goal types (percentage / fixed monthly amount / target date) are
 * validated and computed the same way everywhere they're read or written.
 */

// Validates the savings-goal fields from a form submission (register or
// settings). Returns { data: {...} } on success or { error: 'message' }.
function parseSavingsGoal(body) {
    const {
        savings_goal_type,
        target_savings_percentage,
        target_savings_amount,
        savings_goal_amount,
        savings_goal_date
    } = body;

    let percentage = 0;
    let fixedMonthlyAmount = 0;
    let goalAmount = null;
    let goalDate = null;

    if (savings_goal_type === 'percentage') {
        if (target_savings_percentage === undefined || target_savings_percentage === '') {
            return { error: 'Please enter what percentage of your income you want to save.' };
        }
        percentage = Number(target_savings_percentage);
        if (isNaN(percentage) || percentage < 0 || percentage > 100) {
            return { error: 'Savings percentage must be between 0 and 100.' };
        }
    } else if (savings_goal_type === 'fixed_monthly') {
        if (target_savings_amount === undefined || target_savings_amount === '') {
            return { error: 'Please enter how much you want to save per month.' };
        }
        fixedMonthlyAmount = Number(target_savings_amount);
        if (isNaN(fixedMonthlyAmount) || fixedMonthlyAmount < 0) {
            return { error: 'Monthly savings amount must be a valid number.' };
        }
    } else if (savings_goal_type === 'target_date') {
        if (!savings_goal_amount || !savings_goal_date) {
            return { error: 'Please enter both a savings goal amount and a target date.' };
        }
        goalAmount = Number(savings_goal_amount);
        goalDate = savings_goal_date;
        if (isNaN(goalAmount) || goalAmount <= 0) {
            return { error: 'Savings goal amount must be greater than $0.' };
        }
        if (new Date(goalDate) <= new Date()) {
            return { error: 'Target date must be in the future.' };
        }
    } else {
        return { error: 'Please choose a valid savings goal option.' };
    }

    return {
        data: {
            savings_goal_type,
            target_savings_percentage: percentage,
            target_savings_amount: fixedMonthlyAmount,
            savings_goal_amount: goalAmount,
            savings_goal_date: goalDate
        }
    };
}

// Computes this month's savings target + a human-readable summary from a
// `settings` DB row (or an empty object for a brand-new user).
function computeSavingsPlan(userSettings) {
    const monthlyIncome = Number(userSettings.monthly_income || 0);
    const savingsGoalType = userSettings.savings_goal_type || 'percentage';
    const targetSavingsPercentage = Number(userSettings.target_savings_percentage || 0);

    let targetSavingsAmount = 0;
    let savingsGoalSummary = null;

    if (savingsGoalType === 'fixed_monthly') {
        targetSavingsAmount = Number(userSettings.target_savings_amount || 0);
        savingsGoalSummary = `Saving $${targetSavingsAmount.toFixed(2)}/month`;
    } else if (savingsGoalType === 'target_date' && userSettings.savings_goal_amount && userSettings.savings_goal_date) {
        const goalAmount = Number(userSettings.savings_goal_amount);
        const goalDate = new Date(userSettings.savings_goal_date);
        const now = new Date();
        const monthsRemaining = Math.max(
            1,
            (goalDate.getFullYear() - now.getFullYear()) * 12 + (goalDate.getMonth() - now.getMonth())
        );
        targetSavingsAmount = goalAmount / monthsRemaining;
        savingsGoalSummary = `$${targetSavingsAmount.toFixed(2)}/month to reach $${goalAmount.toFixed(2)} by ${goalDate.toLocaleDateString()}`;
    } else {
        // Default / 'percentage'
        targetSavingsAmount = (monthlyIncome * targetSavingsPercentage) / 100;
        savingsGoalSummary = `Saving ${targetSavingsPercentage}% of income`;
    }

    return { targetSavingsAmount, savingsGoalSummary, monthlyIncome, savingsGoalType, targetSavingsPercentage };
}

module.exports = { parseSavingsGoal, computeSavingsPlan };