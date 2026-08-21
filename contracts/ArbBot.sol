// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IFlashLoanRecipient {
    function receiveFlashLoan(
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external;
}

interface IBalancerVault {
    function flashLoan(
        address recipient,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata userData
    ) external;
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts);
}

interface IUniswapV3Router {
    struct ExactInputSingleParams {
        address tokenIn; address tokenOut; uint24 fee; address recipient;
        uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external returns (uint256 amountOut);
}

interface IAerodromeRouter {
    struct Route { address from; address to; bool stable; address factory; }
    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[] calldata routes, address to, uint256 deadline) external returns (uint256[] memory amounts);
}

interface IAlgebraRouter {
    struct ExactInputSingleParams {
        address tokenIn; address tokenOut; address recipient; uint256 deadline;
        uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external returns (uint256 amountOut);
}

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract ArbBot is IFlashLoanRecipient, Ownable, ReentrancyGuard, Pausable {
    IBalancerVault public immutable BALANCER_VAULT;

    enum DexType { UNISWAP_V2, UNISWAP_V3, SOLIDLY, ALGEBRA }

    struct SwapLeg {
        address router;
        DexType dexType;
        uint24 fee;     // For V3
        bool stable;    // For Solidly
        address factory; // For Solidly
    }

    event ArbitrageExecuted(address tokenIn, address tokenOut, uint256 profit, address router1, address router2);
    event ProfitWithdrawn(address token, uint256 amount);

    constructor(address _vault) Ownable(msg.sender) {
        BALANCER_VAULT = IBalancerVault(_vault);
    }

    function startArbitrage(
        address flashAsset,
        address tokenOut, 
        uint256 flashAmount, 
        SwapLeg calldata leg1, 
        SwapLeg calldata leg2, 
        uint256 minProfit
    ) external onlyOwner whenNotPaused {
        bytes memory userData = abi.encode(flashAsset, tokenOut, leg1, leg2, minProfit);
        
        address[] memory tokens = new address[](1);
        tokens[0] = flashAsset;
        
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = flashAmount;

        BALANCER_VAULT.flashLoan(address(this), tokens, amounts, userData);
    }

    function receiveFlashLoan(
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external override nonReentrant {
        require(msg.sender == address(BALANCER_VAULT), "Untrusted caller");

        (address flashAsset, address tokenOut, SwapLeg memory leg1, SwapLeg memory leg2, uint256 minProfit) = abi.decode(userData, (address, address, SwapLeg, SwapLeg, uint256));
        
        uint256 amount = amounts[0];
        uint256 feeAmount = feeAmounts[0];
        uint256 repayAmount = amount + feeAmount;
        
        // Step 1: Buy tokenOut with flashAsset using Leg 1
        uint256 tokenAmount = _swap(leg1, flashAsset, tokenOut, amount);
        
        // Step 2: Sell tokenOut back to flashAsset using Leg 2
        uint256 finalFlashAsset = _swap(leg2, tokenOut, flashAsset, tokenAmount);

        require(finalFlashAsset >= repayAmount, "Cannot repay loan");
        uint256 profit = finalFlashAsset - repayAmount;
        require(profit >= minProfit, "Insufficient profit");
        
        IERC20(flashAsset).approve(address(BALANCER_VAULT), repayAmount);
        
        if (profit > 0) {
            IERC20(flashAsset).transfer(owner(), profit);
        }
        
        emit ArbitrageExecuted(flashAsset, tokenOut, profit, leg1.router, leg2.router);
    }

    function _swap(SwapLeg memory leg, address from, address to, uint256 amountIn) internal returns (uint256) {
        IERC20(from).approve(leg.router, amountIn);

        if (leg.dexType == DexType.UNISWAP_V3) {
            return IUniswapV3Router(leg.router).exactInputSingle(IUniswapV3Router.ExactInputSingleParams({
                tokenIn: from,
                tokenOut: to,
                fee: leg.fee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            }));
        } 
        else if (leg.dexType == DexType.ALGEBRA) {
            return IAlgebraRouter(leg.router).exactInputSingle(IAlgebraRouter.ExactInputSingleParams({
                tokenIn: from,
                tokenOut: to,
                recipient: address(this),
                deadline: block.timestamp + 60,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            }));
        }
        else if (leg.dexType == DexType.SOLIDLY) {
            IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
            routes[0] = IAerodromeRouter.Route({ 
                from: from, 
                to: to, 
                stable: leg.stable,
                factory: leg.factory
            });
            uint256[] memory amounts = IAerodromeRouter(leg.router).swapExactTokensForTokens(
                amountIn, 0, routes, address(this), block.timestamp + 60
            );
            return amounts[amounts.length - 1];
        }
        else { // UNISWAP_V2
            address[] memory path = new address[](2);
            path[0] = from;
            path[1] = to;
            uint256[] memory amounts = IUniswapV2Router(leg.router).swapExactTokensForTokens(
                amountIn, 0, path, address(this), block.timestamp + 60
            );
            return amounts[amounts.length - 1];
        }
    }

    function sweep(address token) external onlyOwner nonReentrant {
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "Nothing to sweep");
        IERC20(token).transfer(owner(), bal);
        emit ProfitWithdrawn(token, bal);
    }

    function withdrawToken(address token) external onlyOwner nonReentrant {
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "Nothing to withdraw");
        IERC20(token).transfer(owner(), bal);
        emit ProfitWithdrawn(token, bal);
    }

    function withdrawEth() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "ETH transfer failed");
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    receive() external payable {}
}
