// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IFlashLoanSimpleReceiver {
    function executeOperation(address asset, uint256 amount, uint256 premium, address initiator, bytes calldata params) external returns (bool);
}

interface IAavePool {
    function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode) external;
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

contract ArbBot is IFlashLoanSimpleReceiver {
    address public immutable owner;
    IAavePool  constant AAVE_POOL  = IAavePool(0xA238Dd80C259a72e81d7e4664a9801593F98d1c5);
    IUniswapV3Router constant UNI  = IUniswapV3Router(0x2626664c2603336E57B271c5C0b26F421741e481);
    IAerodromeRouter constant AERO = IAerodromeRouter(0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43);
    address constant AERO_FACTORY  = 0x420DD381b31aEf6683db6B902084cB0FFECe40Da;
    address constant USDC          = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    uint8 constant BUY_UNI_SELL_AERO = 1;
    uint8 constant BUY_AERO_SELL_UNI = 2;

    event ArbitrageExecuted(address tokenOut, uint256 profit, uint8 direction);
    event ProfitWithdrawn(address token, uint256 amount);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    constructor() { owner = msg.sender; }

    function startArbitrage(address tokenOut, uint256 flashAmount, uint8 direction, uint24 uniPoolFee, uint256 minProfitUsdc) external onlyOwner {
        bytes memory params = abi.encode(tokenOut, direction, uniPoolFee, minProfitUsdc);
        AAVE_POOL.flashLoanSimple(address(this), USDC, flashAmount, params, 0);
    }

    function executeOperation(address, uint256 amount, uint256 premium, address initiator, bytes calldata params) external override returns (bool) {
        require(msg.sender == address(AAVE_POOL), "Untrusted caller");
        require(initiator == address(this), "Untrusted initiator");
        (address tokenOut, uint8 direction, uint24 uniPoolFee, uint256 minProfitUsdc) = abi.decode(params, (address, uint8, uint24, uint256));
        uint256 repayAmount = amount + premium;
        uint256 finalUsdc;
        if (direction == BUY_UNI_SELL_AERO) {
            finalUsdc = _buyUniSellAero(amount, tokenOut, uniPoolFee);
        } else {
            finalUsdc = _buyAeroSellUni(amount, tokenOut, uniPoolFee);
        }
        require(finalUsdc >= repayAmount + minProfitUsdc, "Profit below minimum");
        IERC20(USDC).approve(address(AAVE_POOL), repayAmount);
        emit ArbitrageExecuted(tokenOut, finalUsdc - repayAmount, direction);
        return true;
    }

    function _buyUniSellAero(uint256 usdcIn, address tokenOut, uint24 fee) internal returns (uint256) {
        IERC20(USDC).approve(address(UNI), usdcIn);
        uint256 tokenAmount = UNI.exactInputSingle(IUniswapV3Router.ExactInputSingleParams({
            tokenIn: USDC, tokenOut: tokenOut, fee: fee, recipient: address(this),
            amountIn: usdcIn, amountOutMinimum: 0, sqrtPriceLimitX96: 0
        }));
        return _aeroSwap(tokenOut, USDC, tokenAmount);
    }

    function _buyAeroSellUni(uint256 usdcIn, address tokenOut, uint24 fee) internal returns (uint256) {
        uint256 tokenAmount = _aeroSwap(USDC, tokenOut, usdcIn);
        IERC20(tokenOut).approve(address(UNI), tokenAmount);
        return UNI.exactInputSingle(IUniswapV3Router.ExactInputSingleParams({
            tokenIn: tokenOut, tokenOut: USDC, fee: fee, recipient: address(this),
            amountIn: tokenAmount, amountOutMinimum: 0, sqrtPriceLimitX96: 0
        }));
    }

    function _aeroSwap(address from, address to, uint256 amountIn) internal returns (uint256) {
        IERC20(from).approve(address(AERO), amountIn);
        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({ from: from, to: to, stable: false, factory: AERO_FACTORY });
        uint256[] memory amounts = AERO.swapExactTokensForTokens(amountIn, 0, routes, address(this), block.timestamp + 60);
        return amounts[amounts.length - 1];
    }

    function withdrawToken(address token) external onlyOwner {
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "Nothing to withdraw");
        IERC20(token).transfer(owner, bal);
        emit ProfitWithdrawn(token, bal);
    }

    function withdrawEth() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }

    receive() external payable {}
}
